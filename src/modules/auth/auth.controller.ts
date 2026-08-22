import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, Public } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { PreserveHttpStatus } from '@wlisfes/chat-web-base-schema/filters'
import type { Request, Response } from 'express'
import { AuthService } from '@/modules/auth/auth.service'
import { AUTH_CAPTCHA_COOKIE, CaptchaService } from '@/modules/auth/captcha.service'
import { CodexWriteQueryDto, LoginDto } from '@/modules/auth/dto/login.dto'

@ApiTags('身份认证')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly captchaService: CaptchaService
    ) {}

    @Public()
    @Get('codex/write')
    @ApiOperation({ summary: '获取图形验证码' })
    async httpAuthCodexWrite(@Req() request: Request, @Res() response: Response, @Query() query: CodexWriteQueryDto) {
        const captcha = await this.captchaService.create(query.inverse === '1')
        response.cookie(AUTH_CAPTCHA_COOKIE, captcha.sid, {
            httpOnly: true,
            maxAge: this.captchaService.expiresIn * 1000,
            path: '/',
            sameSite: 'lax',
            secure: request.secure || request.header('x-forwarded-proto') === 'https'
        })
        response.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0'
        })
        return response.type('image/svg+xml').send(captcha.svg)
    }

    @Public()
    @Post('token/login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '使用工号、手机号或邮箱登录' })
    @ApiOkResponse({ description: '登录成功并返回 Bearer Token' })
    async httpAuthAccountToken(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() input: LoginDto) {
        const result = await this.authService.login(input, this.getCookie(request, AUTH_CAPTCHA_COOKIE))
        response.clearCookie(AUTH_CAPTCHA_COOKIE, { path: '/' })
        return result
    }

    @Post('token/continue')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '续期并轮换当前登录会话' })
    httpAuthAccountTokenContinue(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.refresh(principal)
    }

    @Post('token/logout')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '退出并撤销当前登录会话' })
    async httpAuthAccountTokenLogout(@CurrentPrincipal() principal: AuthPrincipal) {
        await this.authService.logout(principal)
        return { success: true }
    }

    @Get('token/resolver')
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '获取当前登录身份' })
    httpAuthAccountTokenResolver(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.getCurrentUser(principal)
    }

    @Get('token/introspect')
    @Public()
    @PreserveHttpStatus()
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '供内部服务校验访问令牌并获取身份主体' })
    httpAuthAccountTokenIntrospect(@Req() request: Request): Promise<AuthPrincipal> {
        const match = request.header('authorization')?.match(/^Bearer\s+([^\s]+)$/i)
        if (!match) throw new UnauthorizedException('缺少 Bearer 访问令牌')
        return this.authService.authenticateToken(match[1])
    }

    private getCookie(request: Request, name: string): string | undefined {
        const encodedName = `${encodeURIComponent(name)}=`
        for (const entry of request.header('cookie')?.split(';') ?? []) {
            const cookie = entry.trim()
            if (!cookie.startsWith(encodedName)) {
                continue
            }
            try {
                return decodeURIComponent(cookie.slice(encodedName.length))
            } catch {
                return undefined
            }
        }
        return undefined
    }
}
