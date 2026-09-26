import { Injectable, NotFoundException } from '@nestjs/common'
import * as FeignSchema from '@wlisfes/chat-web-base-schema/feign'
import { assertUid } from '@wlisfes/chat-web-base-schema/utils'
import { UserService } from '@/modules/user/user.service'

/** 统一编排账号服务对外暴露的业务 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignSchema.FeignClientAccountManager implements FeignSchema.FeignClientAccountImplementation {
    constructor(private readonly userService: UserService) {
        super()
    }

    /** 按列表批量把账号 UID 还原为展示摘要。 */
    public override async httpBaseAccountColumnUserResolver(
        _authorization: string,
        input: FeignSchema.AccountColumnUserResolverDto
    ): Promise<FeignSchema.AccountUserSummary[]> {
        return this.userService.httpBaseAccountColumnUserResolver(input)
    }

    /** 按账号 UID 还原单个展示摘要；账号不存在时与公开详情接口保持一致。 */
    public override async httpBaseAccountUserResolver(
        _authorization: string,
        input: FeignSchema.AccountUserResolverDto
    ): Promise<FeignSchema.AccountUserSummary> {
        const uid = assertUid(input.uid, '账号UID')
        const [user] = await this.userService.httpBaseAccountColumnUserResolver({ uids: [uid], fields: input.fields })
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        return user
    }
}
