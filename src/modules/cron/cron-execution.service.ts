import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository, In, LessThan, Repository } from '@wlisfes/chat-web-base-schema/database'
import { RabbitmqService } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { generateUid } from '@wlisfes/chat-web-base-schema/utils'
import * as Schema from '@wlisfes/chat-web-base-schema/chat-web-task-mysql'
import * as constants from '@/modules/cron/cron.constants'
import { isRetryableTaskError, TASK_HANDLERS, TaskHandler } from '@/modules/cron/handlers/task-handler.interface'

/** 投递到 RabbitMQ 的消息体：只携带执行记录ID，消费者回库读取详情。 */
export interface TaskExecutionMessage {
    executionId: string
}

/** 创建执行记录的入参。 */
export interface TaskExecutionCreateInput {
    task: Schema.TbTaskCron
    triggerType: Schema.TbTaskExecutionTrigger
    scheduledTime: Date
    operatorUid: string
}

/** 已结束（成功或失败）的执行状态。 */
const FINISHED_STATUSES = [Schema.TbTaskExecutionStatus.SUCCESS, Schema.TbTaskExecutionStatus.FAILED]

/**
 * 执行记录生命周期：生成 → 投递 → 消费执行 → 成功 / 延迟重试 / 失败。
 *
 * - 执行记录先落库再投递，投递失败由补发扫描兜底，RabbitMQ 短暂不可用也不会丢失；
 * - 系统调度的业务键为“任务ID:计划时间”，多实例同一时刻触发只会生成一条记录；
 * - 消费时用条件更新抢占记录，同一记录被重复投递也只会执行一次；
 * - 执行器崩溃导致长时间停留在执行中的记录，会被补发扫描重新投递。
 */
@Injectable()
export class CronExecutionService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly handlers: Map<string, TaskHandler>
    private outboxTimer?: NodeJS.Timeout

    constructor(
        @InjectRepository(Schema.TbTaskExecution) private readonly repository: Repository<Schema.TbTaskExecution>,
        private readonly rabbitmqService: RabbitmqService,
        @Inject(TASK_HANDLERS) handlers: TaskHandler[],
        private readonly logger: Logger
    ) {
        this.handlers = new Map(handlers.map(item => [item.handler, item]))
    }

    /** 启动消费者和补发扫描。 */
    public async onApplicationBootstrap(): Promise<void> {
        await this.rabbitmqService.consume<TaskExecutionMessage>(constants.TASK_EXECUTE_QUEUE, async payload => {
            await this.consume(payload)
            return 'ack'
        })
        this.outboxTimer = setInterval(() => void this.resendPending(), constants.TASK_OUTBOX_SCAN_INTERVAL_MS)
    }

    /** 模块销毁时停止补发扫描。 */
    public onModuleDestroy(): void {
        if (this.outboxTimer) clearInterval(this.outboxTimer)
    }

    /** 判断处理器是否已注册。 */
    public hasHandler(handler: string): boolean {
        return this.handlers.has(handler)
    }

    /** 生成执行记录并投递；业务键重复时返回已有记录，不重复投递。 */
    public async create(input: TaskExecutionCreateInput): Promise<Schema.TbTaskExecution> {
        const executionId = generateUid()
        const bizKey =
            input.triggerType === Schema.TbTaskExecutionTrigger.SYSTEM
                ? `${input.task.taskId}:${this.formatKeyTime(input.scheduledTime)}`
                : `${input.task.taskId}:manual:${executionId}`
        const record = this.repository.create({
            executionId,
            taskId: input.task.taskId,
            taskName: input.task.taskName,
            handler: input.task.handler,
            bizKey,
            triggerType: input.triggerType,
            status: Schema.TbTaskExecutionStatus.PENDING,
            body: input.task.body ?? {},
            attempts: 0,
            maxAttempts: input.task.maxAttempts,
            scheduledTime: input.scheduledTime,
            duration: 0,
            createBy: input.operatorUid,
            modifyBy: input.operatorUid
        })
        try {
            await this.repository.insert(record)
        } catch (error) {
            if (!this.isDuplicateKeyError(error)) throw error
            const existing = await this.repository.findOne({ where: { bizKey } })
            if (existing) return existing
            throw error
        }
        await this.publish(executionId)
        return (await this.repository.findOne({ where: { executionId } })) ?? record
    }

    /** 读取单条执行记录。 */
    public async findByExecutionId(executionId: string): Promise<Schema.TbTaskExecution | null> {
        return this.repository.findOne({ where: { executionId } })
    }

    /** 是否已结束（成功或失败）。 */
    public isFinished(record: Pick<Schema.TbTaskExecution, 'status'>): boolean {
        return FINISHED_STATUSES.includes(record.status)
    }

    /** 投递到主队列；失败只记录日志，publishTime 保持为空，由补发扫描重试。 */
    private async publish(
        executionId: string,
        routingKey = constants.TASK_EXECUTE_ROUTING_KEY,
        exchange = constants.TASK_EXCHANGE
    ): Promise<boolean> {
        try {
            await this.rabbitmqService.publish(exchange, routingKey, { executionId } satisfies TaskExecutionMessage, {
                messageId: executionId
            })
            await this.repository.update({ executionId }, { publishTime: new Date() } as never)
            return true
        } catch (error) {
            this.logger.warn(
                `执行记录投递失败，等待补发：executionId=${executionId}，原因=${this.errorMessage(error)}`,
                CronExecutionService.name
            )
            return false
        }
    }

    /** 投递到延迟重试队列；失败时同样等待补发扫描。 */
    private async publishRetry(executionId: string, delay: number): Promise<boolean> {
        try {
            await this.rabbitmqService.publish('', constants.taskRetryQueue(delay), { executionId } satisfies TaskExecutionMessage, {
                messageId: executionId
            })
            await this.repository.update({ executionId }, { publishTime: new Date() } as never)
            return true
        } catch (error) {
            this.logger.warn(
                `重试消息投递失败，等待补发：executionId=${executionId}，原因=${this.errorMessage(error)}`,
                CronExecutionService.name
            )
            return false
        }
    }

    /** 消费一条执行消息。 */
    public async consume(payload: TaskExecutionMessage): Promise<void> {
        const executionId = payload?.executionId
        if (typeof executionId !== 'string' || !/^\d{1,19}$/.test(executionId)) {
            this.logger.warn(`忽略格式错误的任务消息：${JSON.stringify(payload)}`, CronExecutionService.name)
            return
        }
        const record = await this.claim(executionId)
        if (!record) return
        await this.run(record)
    }

    /** 用条件更新抢占执行权：只有待执行或等待重试的记录才能进入执行中，避免重复投递导致重复执行。 */
    private async claim(executionId: string): Promise<Schema.TbTaskExecution | null> {
        const now = new Date()
        const result = await this.repository
            .createQueryBuilder()
            .update(Schema.TbTaskExecution)
            .set({
                status: Schema.TbTaskExecutionStatus.RUNNING,
                attempts: () => '`attempts` + 1',
                nextRetryTime: null as never,
                startTime: () => `COALESCE(\`start_time\`, '${this.formatSqlTime(now)}')`
            })
            .where('executionId = :executionId', { executionId })
            .andWhere('status IN (:...statuses)', {
                statuses: [Schema.TbTaskExecutionStatus.PENDING, Schema.TbTaskExecutionStatus.RETRYING]
            })
            .execute()
        if (!result.affected) return null
        return this.repository.findOne({ where: { executionId } })
    }

    /** 执行处理器并写入结果。 */
    private async run(record: Schema.TbTaskExecution): Promise<void> {
        const startedAt = Date.now()
        const handler = this.handlers.get(record.handler)
        try {
            if (!handler) throw new Error(`未注册的任务处理器：${record.handler}`)
            const result = await handler.execute({
                executionId: record.executionId,
                bizKey: record.bizKey,
                scheduledTime: new Date(record.scheduledTime),
                attempt: record.attempts,
                body: record.body ?? {}
            })
            await this.repository.update({ executionId: record.executionId }, {
                status: Schema.TbTaskExecutionStatus.SUCCESS,
                endTime: new Date(),
                duration: Date.now() - startedAt,
                result,
                error: null
            } as never)
            this.logger.log(
                `任务执行成功：${record.taskName}（executionId=${record.executionId}，第${record.attempts}次）`,
                CronExecutionService.name
            )
        } catch (error) {
            await this.fail(record, error, Date.now() - startedAt, Boolean(handler) && isRetryableTaskError(error))
        }
    }

    /** 失败处理：可重试且未超过上限时延迟重试，否则标记失败并写入死信队列。 */
    private async fail(record: Schema.TbTaskExecution, error: unknown, duration: number, retryable: boolean): Promise<void> {
        const message = this.errorMessage(error).slice(0, constants.TASK_ERROR_MAX_LENGTH)
        if (retryable && record.attempts < record.maxAttempts) {
            const delay = constants.taskRetryDelay(record.attempts)
            await this.repository.update({ executionId: record.executionId }, {
                status: Schema.TbTaskExecutionStatus.RETRYING,
                nextRetryTime: new Date(Date.now() + delay),
                duration,
                error: message
            } as never)
            await this.publishRetry(record.executionId, delay)
            this.logger.warn(
                `任务执行失败，${Math.round(delay / 1000)} 秒后重试：${record.taskName}（executionId=${record.executionId}，第${record.attempts}次），原因=${message}`,
                CronExecutionService.name
            )
            return
        }
        await this.repository.update({ executionId: record.executionId }, {
            status: Schema.TbTaskExecutionStatus.FAILED,
            endTime: new Date(),
            nextRetryTime: null,
            duration,
            error: message
        } as never)
        await this.publish(record.executionId, constants.TASK_DEAD_ROUTING_KEY, constants.TASK_DEAD_EXCHANGE)
        this.logger.error(
            `任务执行最终失败：${record.taskName}（executionId=${record.executionId}，共${record.attempts}次），原因=${message}`,
            undefined,
            CronExecutionService.name
        )
    }

    /**
     * 补发扫描：
     * - 待执行且长时间未投递成功的记录重新投递主队列；
     * - 等待重试且已过重试时间仍未被消费的记录（重试消息投递失败）重新投递主队列；
     * - 执行中超时的记录（执行器崩溃）恢复为等待重试后重新投递。
     */
    public async resendPending(): Promise<void> {
        try {
            const now = Date.now()
            const pending = await this.repository.find({
                where: [
                    { status: Schema.TbTaskExecutionStatus.PENDING, createTime: LessThan(new Date(now - constants.TASK_OUTBOX_STALE_MS)) },
                    {
                        status: Schema.TbTaskExecutionStatus.RETRYING,
                        nextRetryTime: LessThan(new Date(now - constants.TASK_OUTBOX_STALE_MS))
                    }
                ],
                take: 100
            })
            const stuck = await this.repository.find({
                where: {
                    status: In([Schema.TbTaskExecutionStatus.RUNNING]),
                    modifyTime: LessThan(new Date(now - constants.TASK_RUNNING_STALE_MS))
                },
                take: 100
            })
            for (const record of stuck) {
                const reset = await this.repository.update(
                    { executionId: record.executionId, status: Schema.TbTaskExecutionStatus.RUNNING },
                    { status: Schema.TbTaskExecutionStatus.RETRYING, error: '执行超时，执行器可能已中断，重新投递' } as never
                )
                if (reset.affected) pending.push(record)
            }
            for (const record of pending) await this.publish(record.executionId)
        } catch (error) {
            this.logger.error(`补发扫描失败：${this.errorMessage(error)}`, undefined, CronExecutionService.name)
        }
    }

    private formatKeyTime(date: Date): string {
        const pad = (value: number, length = 2) => String(value).padStart(length, '0')
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    }

    private formatSqlTime(date: Date): string {
        const pad = (value: number, length = 2) => String(value).padStart(length, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    }

    private isDuplicateKeyError(error: unknown): boolean {
        const value = error as { code?: unknown; errno?: unknown; driverError?: { code?: unknown; errno?: unknown } } | undefined
        return (
            value?.code === 'ER_DUP_ENTRY' ||
            Number(value?.errno) === 1062 ||
            value?.driverError?.code === 'ER_DUP_ENTRY' ||
            Number(value?.driverError?.errno) === 1062
        )
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
