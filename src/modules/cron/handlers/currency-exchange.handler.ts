import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FeignClientFinanceManager, resolveFeignServiceAuthorization } from '@wlisfes/chat-web-base-schema/feign'
import { CURRENCY_EXCHANGE_TASK_HANDLER } from '@/modules/cron/cron.constants'
import { TaskHandler } from '@/modules/cron/handlers/task-handler.interface'

/** 汇率同步：只负责触发 Finance 服务，汇率拉取、过滤和持久化全部由 Finance 完成，Finance 按日期去重可安全重试。 */
@Injectable()
export class CurrencyExchangeTaskHandler implements TaskHandler {
    public readonly handler = CURRENCY_EXCHANGE_TASK_HANDLER

    constructor(
        private readonly configService: ConfigService,
        private readonly financeFeignClient: FeignClientFinanceManager
    ) {}

    /** 使用服务间凭据触发 Finance 汇率同步，只保存日期和写入条数作为结果摘要。 */
    public async execute(): Promise<Record<string, unknown>> {
        const authorization = resolveFeignServiceAuthorization(this.configService)
        const result = await this.financeFeignClient.httpBaseFinanceSyncCurrencyExchange(authorization)
        return { date: result.date, count: result.count }
    }
}
