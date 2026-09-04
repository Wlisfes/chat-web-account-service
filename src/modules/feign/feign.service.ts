import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FeignClientAccountManager, FeignClientAccountImplementation } from '@wlisfes/chat-web-base-schema/feign'
import { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { AuthService } from '@/modules/auth/auth.service'

/** 统一编排账号服务当前对外暴露的 Feign 调用，实现与业务模块保持单向依赖。 */
@Injectable()
export class FeignService extends FeignClientAccountManager implements FeignClientAccountImplementation {
    constructor(private readonly authService: AuthService) {
        super()
    }

    public override async introspect(authorization: string): Promise<AuthPrincipal> {
        const match = authorization.match(/^Bearer\s+([^\s]+)$/i)
        if (!match) throw new Error('Bearer 访问令牌格式错误')
        return this.authService.authenticateToken(match[1])
    }
}
