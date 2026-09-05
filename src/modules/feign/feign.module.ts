import { Module } from '@nestjs/common'
import { ConsumerModule } from '@/modules/consumer/consumer.module'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'
import { UserModule } from '@/modules/user/user.module'

@Module({
    imports: [ConsumerModule, UserModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
