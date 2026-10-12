import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import * as Schema from '@wlisfes/chat-web-base-schema/chat-web-task-mysql'
import * as constants from '@/modules/cron/cron.constants'
import { CronExecutionService } from '@/modules/cron/cron-execution.service'
import { CronExpressionService } from '@/modules/cron/cron-expression.service'

/**
 * 周期任务调度器。
 *
 * 每个实例都为启用的任务注册定时器；到点后按“任务ID:计划时间”生成执行记录，
 * 唯一业务键保证多实例同一时刻只生成一条，执行由 RabbitMQ 消费者完成。
 * 任一实例崩溃不影响其他实例继续调度，也不依赖分布式锁的持有者存活。
 */
@Injectable()
export class CronSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly timers = new Map<string, NodeJS.Timeout>()
    private readonly generations = new Map<string, number>()
    private refreshRetryTimer?: NodeJS.Timeout
    private refreshVersion = 0

    constructor(
        @InjectRepository(Schema.TbTaskCron) private readonly repository: Repository<Schema.TbTaskCron>,
        private readonly cronExpressionService: CronExpressionService,
        private readonly cronExecutionService: CronExecutionService,
        private readonly logger: Logger
    ) {}

    /** 启动时加载调度；数据库读取失败必须阻止服务以“无调度”状态运行。 */
    public async onApplicationBootstrap(): Promise<void> {
        await this.refresh(true)
    }

    /** 模块销毁时清理所有定时器。 */
    public onModuleDestroy(): void {
        this.refreshVersion += 1
        for (const timer of this.timers.values()) clearTimeout(timer)
        this.timers.clear()
        if (this.refreshRetryTimer) clearTimeout(this.refreshRetryTimer)
        this.refreshRetryTimer = undefined
        this.generations.clear()
    }

    /** 从数据库重新加载并注册启用的任务。 */
    public async refresh(strict = false): Promise<void> {
        const version = ++this.refreshVersion
        let tasks: Schema.TbTaskCron[]
        try {
            tasks = await this.repository.find({ where: { status: Schema.TbTaskCronStatus.ENABLE } })
        } catch (error) {
            this.logger.error(`加载周期任务失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
            if (strict) throw error
            if (version === this.refreshVersion) this.scheduleRefreshRetry()
            return
        }
        if (version !== this.refreshVersion) return
        for (const timer of this.timers.values()) clearTimeout(timer)
        this.timers.clear()
        if (this.refreshRetryTimer) clearTimeout(this.refreshRetryTimer)
        this.refreshRetryTimer = undefined
        for (const task of tasks) this.schedule(task.taskId)
        this.logger.log(`周期任务调度器已加载 ${tasks.length} 条任务`, CronSchedulerService.name)
    }

    /** 注册或重新注册单个任务；任务状态或 Cron 变化后调用。 */
    public schedule(taskId: string): void {
        this.refreshVersion += 1
        const previous = this.timers.get(taskId)
        if (previous) clearTimeout(previous)
        this.timers.delete(taskId)
        const generation = this.bumpGeneration(taskId)
        void this.scheduleNext(taskId, generation).catch(error => {
            this.logger.error(`任务 ${taskId} 调度失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
            this.scheduleRetry(taskId, generation)
        })
    }

    /** 取消单个任务调度。 */
    public unschedule(taskId: string): void {
        this.refreshVersion += 1
        const timer = this.timers.get(taskId)
        if (timer) clearTimeout(timer)
        this.timers.delete(taskId)
        this.bumpGeneration(taskId)
    }

    private async scheduleNext(taskId: string, generation: number): Promise<void> {
        if (!this.isCurrentGeneration(taskId, generation)) return
        let task: Schema.TbTaskCron | null
        try {
            task = await this.repository.findOne({ where: { taskId } })
        } catch (error) {
            this.logger.error(`读取任务 ${taskId} 失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
            this.scheduleRetry(taskId, generation)
            return
        }
        if (!this.isCurrentGeneration(taskId, generation) || !task || task.status !== Schema.TbTaskCronStatus.ENABLE) return

        let next: Date | undefined
        try {
            next = this.cronExpressionService.getNextRun(task.cron, new Date())
        } catch (error) {
            this.logger.error(`任务 ${taskId} 的 Cron 表达式无效：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
            return
        }
        if (!next) {
            this.logger.warn(`任务 ${taskId} 没有可计算的下次执行时间`, CronSchedulerService.name)
            return
        }
        const remaining = next.getTime() - Date.now()
        const requiresRecalculation = remaining > constants.TASK_MAX_TIMER_DELAY_MS
        const delay = Math.max(100, Math.min(remaining, constants.TASK_MAX_TIMER_DELAY_MS))
        this.logger.log(
            `已注册调度：${task.taskName}（taskId=${taskId}，Cron=${task.cron}，下次执行=${next.toLocaleString('zh-CN', { hour12: false })}）`,
            CronSchedulerService.name
        )
        await this.repository.update({ taskId }, { nextTime: next } as never).catch(error => {
            this.logger.warn(`更新任务 ${taskId} 下次执行时间失败：${this.errorMessage(error)}`, CronSchedulerService.name)
        })
        if (!this.isCurrentGeneration(taskId, generation)) return
        const scheduledTime = next
        const timer = setTimeout(() => {
            if (!this.isCurrentGeneration(taskId, generation) || this.timers.get(taskId) !== timer) return
            this.timers.delete(taskId)
            void (async () => {
                if (!requiresRecalculation) await this.fire(taskId, scheduledTime)
            })()
                .catch(error =>
                    this.logger.error(`任务 ${taskId} 触发失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
                )
                .finally(() => {
                    if (!this.isCurrentGeneration(taskId, generation)) return
                    void this.scheduleNext(taskId, generation).catch(error => {
                        this.logger.error(`任务 ${taskId} 调度失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
                        this.scheduleRetry(taskId, generation)
                    })
                })
        }, delay)
        this.timers.set(taskId, timer)
    }

    /** 到点生成执行记录；任务已停用时跳过。 */
    private async fire(taskId: string, scheduledTime: Date): Promise<void> {
        const task = await this.repository.findOne({ where: { taskId } })
        if (!task || task.status !== Schema.TbTaskCronStatus.ENABLE) return
        await this.cronExecutionService.create({
            task,
            triggerType: Schema.TbTaskExecutionTrigger.SYSTEM,
            scheduledTime,
            operatorUid: constants.TASK_SYSTEM_UID
        })
        await this.repository.update({ taskId }, { lastTime: scheduledTime } as never).catch(error => {
            this.logger.warn(`更新任务 ${taskId} 上次执行时间失败：${this.errorMessage(error)}`, CronSchedulerService.name)
        })
    }

    private scheduleRefreshRetry(): void {
        if (this.refreshRetryTimer) return
        const timer = setTimeout(() => {
            if (this.refreshRetryTimer !== timer) return
            this.refreshRetryTimer = undefined
            void this.refresh(false).catch(error => {
                this.logger.error(`刷新周期任务重试失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
                this.scheduleRefreshRetry()
            })
        }, constants.TASK_SCHEDULER_RETRY_DELAY_MS)
        this.refreshRetryTimer = timer
    }

    private scheduleRetry(taskId: string, generation: number): void {
        if (!this.isCurrentGeneration(taskId, generation) || this.timers.has(taskId)) return
        const timer = setTimeout(() => {
            if (!this.isCurrentGeneration(taskId, generation) || this.timers.get(taskId) !== timer) return
            this.timers.delete(taskId)
            void this.scheduleNext(taskId, generation).catch(error => {
                this.logger.error(`任务 ${taskId} 重试调度失败：${this.errorMessage(error)}`, undefined, CronSchedulerService.name)
                this.scheduleRetry(taskId, generation)
            })
        }, constants.TASK_SCHEDULER_RETRY_DELAY_MS)
        this.timers.set(taskId, timer)
    }

    private bumpGeneration(taskId: string): number {
        const generation = (this.generations.get(taskId) ?? 0) + 1
        this.generations.set(taskId, generation)
        return generation
    }

    private isCurrentGeneration(taskId: string, generation: number): boolean {
        return this.generations.get(taskId) === generation
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
