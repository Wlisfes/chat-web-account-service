import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AUTH_TOKEN_AUTHENTICATOR, AuthSessionService, JwtAuthGuard, TokenService } from '@wlisfes/chat-web-base-schema/auth'
import { TbAccountUser } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { AuthController } from '@/modules/auth/auth.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { AuthUtilsService } from '@/modules/auth/auth.utils.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { InternalAuthController } from '@/modules/auth/internal-auth.controller'
import { InternalAuthGuard } from '@/modules/auth/internal-auth.guard'
import { PasswordService } from '@/modules/auth/password.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountUser])],
    controllers: [AuthController, InternalAuthController],
    providers: [
        AuthService,
        AuthUtilsService,
        AuthSessionService,
        CaptchaService,
        InternalAuthGuard,
        JwtAuthGuard,
        PasswordService,
        TokenService,
        { provide: AUTH_TOKEN_AUTHENTICATOR, useExisting: AuthService }
    ],
    exports: [AuthService, JwtAuthGuard, PasswordService, TokenService]
})
export class AuthModule {}
