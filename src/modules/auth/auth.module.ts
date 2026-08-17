import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountUser } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { AuthController } from '@/modules/auth/auth.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard'
import { PasswordService } from '@/modules/auth/password.service'
import { TokenService } from '@/modules/auth/token.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountUser])],
    controllers: [AuthController],
    providers: [AuthService, JwtAuthGuard, PasswordService, TokenService],
    exports: [AuthService, JwtAuthGuard, PasswordService, TokenService]
})
export class AuthModule {}
