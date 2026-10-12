import { ConfigService } from '@nestjs/config'
import { ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { FeignClientTaskManager } from '@wlisfes/chat-web-base-schema/feign'
import { FeignService } from '@/feign/feign.service'

/**
 * Task 服务内部 Feign 接口控制器。
 *
 * 路由与凭据校验全部继承共享 Task Feign 客户端；Task 服务只开放 /feign/task 服务间接口，不提供 /api/task 公网入口。
 */
@ApifoxController('内部 Feign 接口')
export class FeignController extends FeignClientTaskManager {
    constructor(feignService: FeignService, configService: ConfigService) {
        super(feignService, configService)
    }
}
