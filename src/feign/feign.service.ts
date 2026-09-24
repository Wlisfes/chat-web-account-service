import { Injectable } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { UserService } from '@/modules/user/user.service'

/** 统一编排账号服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignSchema.FeignClientAccountManager implements FeignSchema.FeignClientAccountImplementation {
    constructor(private readonly userService: UserService) {
        super()
    }

    /** 批量把账号 UID 还原为展示摘要。 */
    public override async httpBaseAccountBatchUserResolver(
        _authorization: string,
        input: FeignSchema.AccountUserBatchDto
    ): Promise<FeignSchema.AccountUserSummary[]> {
        return this.userService.httpBaseAccountBatchResolverUser(input)
    }
}
