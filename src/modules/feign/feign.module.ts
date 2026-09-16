import { Global, Module } from '@nestjs/common'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'
import { UserModule } from '@/modules/user/user.module'

@Global()
@Module({
    imports: [UserModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
