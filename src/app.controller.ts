import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { Public } from '@/modules/auth/auth.decorator'
import { HealthService } from '@/modules/health/health.service'
import { AppService } from '@/app.service'

@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly healthService: HealthService
    ) {}

    @Public()
    @Get()
    getHello(): string {
        return this.appService.getHello()
    }

    @Public()
    @Get('health')
    async health() {
        const result = await this.healthService.getReadiness()
        if (result.status !== 'UP') {
            throw new ServiceUnavailableException(result)
        }
        return result
    }

    @Public()
    @Get('health/live')
    liveness() {
        return this.healthService.getLiveness()
    }

    @Public()
    @Get('health/ready')
    async readiness() {
        return this.health()
    }
}
