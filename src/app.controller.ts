import { Get, ServiceUnavailableException } from '@nestjs/common'
import { Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import { HealthService } from '@/modules/health/health.service'
import { AppService } from '@/app.service'
import { ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'

@ApifoxController('账号服务-运行状态')
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly healthService: HealthService
    ) {}

    @Public()
    @ApiServiceDecorator(Get(), {
        operation: { summary: '查看账号服务信息' },
        response: { type: String, description: '账号服务名称' }
    })
    getHello(): string {
        return this.appService.getHello()
    }

    @Public()
    @ApiServiceDecorator(Get('health'), {
        operation: { summary: '账号服务健康检查' },
        response: { type: ServiceReadinessResponseDto, description: '数据库、Redis 与安全配置状态' }
    })
    @PreserveHttpStatus()
    async health() {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') {
            throw new ServiceUnavailableException({ message: '账号服务尚未就绪', data: result })
        }
        return result
    }

    @Public()
    @ApiServiceDecorator(Get('health/live'), {
        operation: { summary: '账号服务存活检查' },
        response: { type: ServiceLivenessResponseDto, description: '进程正常时返回 UP' }
    })
    liveness() {
        return this.healthService.getLiveness()
    }

    @Public()
    @ApiServiceDecorator(Get('health/ready'), {
        operation: { summary: '账号服务就绪检查' },
        response: { type: ServiceReadinessResponseDto, description: '数据库、Redis 与安全配置状态' }
    })
    @PreserveHttpStatus()
    async readiness() {
        return this.health()
    }
}
