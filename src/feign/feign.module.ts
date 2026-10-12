import { Module } from '@nestjs/common'
import { FeignController } from '@/feign/feign.controller'
import { FeignService } from '@/feign/feign.service'
import { CronModule } from '@/modules/cron/cron.module'

@Module({
    imports: [CronModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
