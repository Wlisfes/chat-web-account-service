import { Global, Module } from '@nestjs/common'
import { FeignClientAuthManager, FeignModule as SharedFeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'
import { UserModule } from '@/modules/user/user.module'

@Global()
@Module({
    imports: [UserModule, SharedFeignModule.register([FeignClientAuthManager])],
    controllers: [FeignController],
    providers: [FeignService],
    exports: [SharedFeignModule]
})
export class FeignModule {}
