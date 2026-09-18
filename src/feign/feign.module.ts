import { Global, Module } from '@nestjs/common'
import { FeignController } from '@/feign/feign.controller'
import { FeignService } from '@/feign/feign.service'
import { UserModule } from '@/modules/user/user.module'

@Global()
@Module({
    imports: [UserModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
