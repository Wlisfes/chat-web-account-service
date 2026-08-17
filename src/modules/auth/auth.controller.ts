import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthService } from '@/modules/auth/auth.service'
import { CurrentPrincipal, Public } from '@/modules/auth/auth.decorator'
import type { AuthPrincipal } from '@/modules/auth/auth.interface'
import { LoginDto } from '@/modules/auth/dto/login.dto'

@ApiTags('身份认证')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('login')
    @ApiOperation({ summary: '使用工号、手机号或邮箱登录' })
    @ApiOkResponse({ description: '登录成功并返回 Bearer Token' })
    login(@Body() input: LoginDto) {
        return this.authService.login(input)
    }

    @Get('me')
    @ApiBearerAuth('authorization')
    @ApiOperation({ summary: '获取当前登录身份' })
    getCurrentPrincipal(@CurrentPrincipal() principal: AuthPrincipal) {
        return principal
    }
}
