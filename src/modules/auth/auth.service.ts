import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountUser, TbAccountUserEmploymentStatus, TbAccountUserStatus } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { Repository } from 'typeorm'
import { AuthPrincipal } from '@/modules/auth/auth.interface'
import { AuthSessionService } from '@/modules/auth/auth-session.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { LoginDto } from '@/modules/auth/dto/login.dto'
import { PasswordService } from '@/modules/auth/password.service'
import { TokenService } from '@/modules/auth/token.service'

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(TbAccountUser) private readonly userRepository: Repository<TbAccountUser>,
        private readonly passwordService: PasswordService,
        private readonly tokenService: TokenService,
        private readonly sessionService: AuthSessionService,
        private readonly captchaService: CaptchaService
    ) {}

    async login(input: LoginDto, captchaSid?: string) {
        await this.captchaService.verify(captchaSid, input.code)
        const account = input.account.trim()
        const user = await this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.number = :account OR user.phone = :account OR user.email = :account', { account })
            .getOne()

        if (!user || !(await this.passwordService.verify(input.password, user.password))) {
            throw new UnauthorizedException('账号或密码错误')
        }
        this.assertActiveUser(user)

        await this.userRepository.update({ uid: user.uid }, { lastLoginTime: new Date() })
        const issued = this.tokenService.issueAccessToken(user.uid)
        await this.sessionService.create(issued.claims)
        const { claims: _claims, ...token } = issued
        return {
            ...token,
            user: {
                uid: user.uid,
                number: user.number,
                name: user.name,
                avatar: user.avatar
            }
        }
    }

    async authenticateToken(token: string): Promise<AuthPrincipal> {
        const claims = this.tokenService.verifyAccessToken(token)
        await this.sessionService.assertActive(claims)
        const user = await this.userRepository.findOne({ where: { uid: claims.sub } })
        if (!user) {
            throw new UnauthorizedException('账号不存在')
        }
        this.assertActiveUser(user)
        return { uid: user.uid, sessionId: claims.jti }
    }

    async refresh(principal: AuthPrincipal) {
        const issued = this.tokenService.issueAccessToken(principal.uid)
        await this.sessionService.rotate(principal.sessionId, issued.claims)
        const { claims: _claims, ...token } = issued
        return token
    }

    async logout(principal: AuthPrincipal): Promise<void> {
        await this.sessionService.revoke(principal.sessionId)
    }

    async getCurrentUser(principal: AuthPrincipal) {
        const user = await this.userRepository.findOne({ where: { uid: principal.uid } })
        if (!user) {
            throw new UnauthorizedException('账号不存在')
        }
        this.assertActiveUser(user)
        return user
    }

    private assertActiveUser(user: TbAccountUser): void {
        if (user.status !== TbAccountUserStatus.ENABLED) {
            throw new UnauthorizedException('账号已禁用')
        }
        if (user.employmentStatus !== TbAccountUserEmploymentStatus.EMPLOYED) {
            throw new UnauthorizedException('账号已离职')
        }
    }
}
