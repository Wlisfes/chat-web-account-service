import { Get } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { AppService } from '@/app.service'
import * as HealthDto from '@/health/dto/health.dto'

@ApifoxController('账号服务-运行状态')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public()
    @ApiServiceDecorator(Get(), {
        operation: { summary: '查看账号服务信息' },
        response: { type: String, description: '账号服务名称' }
    })
    public async httpBaseAccountResolverService() {
        return this.appService.httpBaseAccountResolverService()
    }

    @Public()
    @ApiServiceDecorator(Get('health'), {
        operation: { summary: '账号服务健康检查' },
        response: { type: HealthDto.ServiceReadinessResponseDto, description: '数据库与鉴权服务连接配置状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseAccountHealthService() {
        return this.appService.httpBaseAccountHealthService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '账号服务存活检查' },
        response: { type: HealthDto.ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    public async httpBaseAccountLivenessService() {
        return this.appService.httpBaseAccountLivenessService()
    }

    @Public()
    @ApiServiceDecorator(Get('health/ready'), {
        operation: { summary: '账号服务就绪检查' },
        response: { type: HealthDto.ServiceReadinessResponseDto, description: '数据库与鉴权服务连接配置状态' }
    })
    @PreserveHttpStatus()
    public async httpBaseAccountReadinessService() {
        return this.appService.httpBaseAccountReadinessService()
    }
}
