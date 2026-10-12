import { Get, Header } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { TaskLivenessResponseDto } from '@/dto/task-response.dto'
import { AppService } from '@/app.service'

/** Task 服务首页与存活检查；仅供 Docker 健康检查和 Gateway 探活，不返回业务数据。 */
@ApifoxController('Task 服务')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @ApiServiceDecorator(Get(), {
        operation: { summary: '获取 Task 服务欢迎信息' },
        response: { type: String, example: 'Hello World!', contentType: 'text/plain', envelope: false, description: 'Task 服务欢迎信息' },
        produces: ['text/plain']
    })
    @Public()
    @Header('Content-Type', 'text/plain; charset=utf-8')
    public async httpBaseTaskWelcome(): Promise<string> {
        return this.appService.httpBaseTaskWelcome()
    }

    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: 'Task 服务存活检查' },
        response: { type: TaskLivenessResponseDto, envelope: false, description: '进程正常时返回 UP' }
    })
    @Public()
    @Header('Content-Type', 'application/json; charset=utf-8')
    public async httpBaseTaskLiveness(): Promise<TaskLivenessResponseDto> {
        return this.appService.httpBaseTaskLiveness()
    }
}
