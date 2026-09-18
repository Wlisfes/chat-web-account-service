import { ConfigService } from '@nestjs/config'
import { ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FeignClientAccountManager } from '@wlisfes/chat-web-base-schema/feign'
import { FeignService } from '@/feign/feign.service'

@ApifoxController('内部 Feign 接口')
export class FeignController extends FeignClientAccountManager {
    constructor(feignService: FeignService, configService: ConfigService) {
        super(feignService, configService)
    }
}
