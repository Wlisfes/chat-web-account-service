import { HttpException } from '@nestjs/common'

/** 处理器执行上下文。 */
export interface TaskHandlerContext {
    /** 执行记录ID。 */
    executionId: string
    /** 业务幂等键，下游接口可用于去重。 */
    bizKey: string
    /** 计划执行时间。 */
    scheduledTime: Date
    /** 本次是第几次尝试（从 1 开始）。 */
    attempt: number
    /** 任务参数快照。 */
    body: Record<string, unknown>
}

/** 周期任务处理器；返回值作为执行结果摘要保存，不得包含业务明细或敏感信息。 */
export interface TaskHandler {
    /** 处理器标识，与 tb_task_cron.handler 对应。 */
    readonly handler: string
    /** 执行一次任务。 */
    execute(context: TaskHandlerContext): Promise<Record<string, unknown>>
}

/** 不可重试的错误：参数错误、权限错误等，重试也不会成功，直接标记失败并进入死信。 */
export class TaskNonRetryableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'TaskNonRetryableError'
    }
}

/** 判断错误是否值得重试：网络、超时和 5xx 重试；4xx（429 除外）和显式不可重试错误不重试。 */
export function isRetryableTaskError(error: unknown): boolean {
    if (error instanceof TaskNonRetryableError) return false
    if (error instanceof HttpException) {
        const status = error.getStatus()
        return status >= 500 || status === 408 || status === 429
    }
    return true
}

/** 处理器注入令牌，各处理器以 multi provider 方式注册。 */
export const TASK_HANDLERS = Symbol('TASK_HANDLERS')
