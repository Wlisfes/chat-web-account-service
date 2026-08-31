import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'
import { HealthService } from '@/modules/health/health.service'

@Injectable()
export class AppService {
    constructor(private readonly healthService: HealthService) {}

    /**账号服务信息*/
    public async httpBaseAccountResolverService(): Promise<string> {
        return 'Hello World!'
    }

    /**账号服务兼容就绪状态*/
    public async httpBaseAccountHealthService(): Promise<ServiceReadinessResponseDto> {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') {
            throw new ServiceUnavailableException({ message: '账号服务尚未就绪', data: result })
        }
        return result
    }

    /**账号服务存活状态*/
    public async httpBaseAccountLivenessService(): Promise<ServiceLivenessResponseDto> {
        return this.healthService.getLiveness()
    }

    /**账号服务就绪状态*/
    public async httpBaseAccountReadinessService(): Promise<ServiceReadinessResponseDto> {
        return this.httpBaseAccountHealthService()
    }
}
