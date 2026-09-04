import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { AuthPrincipalResponseDto, Public } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator } from '@wlisfes/chat-web-base-schema/decorator'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { AuthService } from '@/modules/auth/auth.service'
import { InternalAuthGuard } from '@/modules/auth/internal-auth.guard'
import { TokenIntrospectionDto } from '@/modules/auth/dto/token-introspection.dto'

/** 只供网关和可信服务调用的认证基础设施接口。 */
@Controller('internal/auth')
export class InternalAuthController {
    constructor(private readonly authService: AuthService) {}

    /** 由服务凭据保护，校验用户访问令牌并返回身份主体。 */
    @Public()
    @UseGuards(InternalAuthGuard)
    @PreserveHttpStatus()
    @HttpCode(HttpStatus.OK)
    @ApiServiceDecorator(Post('token/introspect'), {
        operation: { summary: '供网关校验用户访问令牌并获取身份主体' },
        request: { source: 'body', type: TokenIntrospectionDto },
        response: { type: AuthPrincipalResponseDto, description: '令牌对应的身份主体' },
        bearerAuth: false
    })
    public async httpBaseAccountIntrospectToken(@Body() input: TokenIntrospectionDto): Promise<AuthPrincipal> {
        return this.authService.httpBaseAccountIntrospectToken(input.token)
    }
}
