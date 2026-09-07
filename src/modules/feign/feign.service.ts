import { Injectable } from '@nestjs/common'
import {
    AccountUserSummary,
    AccountUserBatchDto,
    FeignClientAccountManager,
    FeignClientAccountImplementation
} from '@wlisfes/chat-web-base-schema/feign'
import { UserService } from '@/modules/user/user.service'

/** 统一编排账号服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignClientAccountManager implements FeignClientAccountImplementation {
    constructor(private readonly userService: UserService) {
        super()
    }

    public override async batchResolveUsers(_authorization: string, input: AccountUserBatchDto): Promise<AccountUserSummary[]> {
        return this.userService.httpBaseAccountBatchResolverUser(input)
    }
}
