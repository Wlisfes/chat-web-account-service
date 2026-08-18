import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AuthService } from '@/modules/auth/auth.service'
import { CurrentPrincipal, Public } from '@/modules/auth/auth.decorator'
import type { AuthPrincipal } from '@/modules/auth/auth.interface'
import { AUTH_CAPTCHA_COOKIE, CaptchaService } from '@/modules/auth/captcha.service'
import { LoginDto } from '@/modules/auth/dto/login.dto'

@ApiTags('身份认证')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly captchaService: CaptchaService
    ) {}

    @Public()
    @Get('captcha')
    @ApiOperation({ summary: '获取图形验证码' })
    async getCaptcha(@Req() request: Request, @Res() response: Response, @Query('inverse') inverse?: string) {
        const captcha = await this.captchaService.create(inverse === '1')
        response.cookie(AUTH_CAPTCHA_COOKIE, captcha.sid, {
            httpOnly: true,
            maxAge: this.captchaService.expiresIn * 1000,
            sameSite: 'lax',
            secure: request.secure || request.header('x-forwarded-proto') === 'https'
        })
        return response.type('image/svg+xml').send(captcha.svg)
    }

    @Public()
    @Post('login')
    @ApiOperation({ summary: '使用工号、手机号或邮箱登录' })
    @ApiOkResponse({ description: '登录成功并返回 Bearer Token' })
    async login(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() input: LoginDto) {
        const result = await this.authService.login(input, this.getCookie(request, AUTH_CAPTCHA_COOKIE))
        response.clearCookie(AUTH_CAPTCHA_COOKIE)
        return result
    }

    @Post('refresh')
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '续期并轮换当前登录会话' })
    refresh(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.refresh(principal)
    }

    @Post('logout')
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '退出并撤销当前登录会话' })
    async logout(@CurrentPrincipal() principal: AuthPrincipal) {
        await this.authService.logout(principal)
        return { success: true }
    }

    @Get('me')
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '获取当前登录身份' })
    getCurrentPrincipal(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.authService.getCurrentUser(principal)
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
