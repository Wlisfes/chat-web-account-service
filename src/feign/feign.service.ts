import { Injectable } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { CronService } from '@/modules/cron/cron.service'

/** Task 服务对内 Feign 接口实现；业务逻辑全部委托给周期任务模块，凭据由共享客户端在分发前校验。 */
@Injectable()
export class FeignService implements FeignSchema.FeignClientTaskImplementation {
    constructor(private readonly cronService: CronService) {}

    /**分页查询周期任务**/
    public async httpBaseTaskColumnCron(_authorization: string, input: FeignSchema.TaskColumnCronInput): Promise<FeignSchema.TaskCronPage> {
        return this.cronService.httpBaseTaskColumnCron(input)
    }

    /**获取周期任务详情**/
    public async httpBaseTaskCronResolver(_authorization: string, input: FeignSchema.TaskCronKeyInput): Promise<FeignSchema.TaskCron> {
        return this.cronService.httpBaseTaskCronResolver(input)
    }

    /**启用或停用周期任务**/
    public async httpBaseTaskCronStatusUpdate(
        _authorization: string,
        input: FeignSchema.TaskCronStatusUpdateInput
    ): Promise<FeignSchema.TaskCron> {
        return this.cronService.httpBaseTaskCronStatusUpdate(input)
    }

    /**修改周期任务 Cron 表达式**/
    public async httpBaseTaskUpdateCron(_authorization: string, input: FeignSchema.TaskCronUpdateInput): Promise<FeignSchema.TaskCron> {
        return this.cronService.httpBaseTaskUpdateCron(input)
    }

    /**手动触发周期任务**/
    public async httpBaseTaskTriggerCron(
        _authorization: string,
        input: FeignSchema.TaskTriggerCronInput
    ): Promise<FeignSchema.TaskTriggerCronResult> {
        return this.cronService.httpBaseTaskTriggerCron(input)
    }

    /**分页查询执行记录**/
    public async httpBaseTaskColumnExecution(
        _authorization: string,
        input: FeignSchema.TaskColumnExecutionInput
    ): Promise<FeignSchema.TaskExecutionPage> {
        return this.cronService.httpBaseTaskColumnExecution(input)
    }

    /**获取单条执行记录**/
    public async httpBaseTaskExecutionResolver(
        _authorization: string,
        input: FeignSchema.TaskExecutionResolverInput
    ): Promise<FeignSchema.TaskExecution> {
        return this.cronService.httpBaseTaskExecutionResolver(input)
    }
}
