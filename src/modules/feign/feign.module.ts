import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { FeignController } from '@/modules/feign/feign.controller'
import { FeignService } from '@/modules/feign/feign.service'

@Module({
    imports: [AuthModule],
    controllers: [FeignController],
    providers: [FeignService]
})
export class FeignModule {}
