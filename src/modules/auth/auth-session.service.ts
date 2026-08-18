import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessTokenClaims } from '@/modules/auth/auth.interface'
import { RedisService } from '@/modules/redis/redis.service'

@Injectable()
export class AuthSessionService {
    private readonly prefix: string

    constructor(
        private readonly redisService: RedisService,
        configService: ConfigService
    ) {
        this.prefix = configService.get<string>('AUTH_SESSION_PREFIX')?.trim() || 'chat-web:account:session'
    }

    async create(claims: AccessTokenClaims): Promise<void> {
        await this.redisService.setEx(this.getKey(claims.jti), this.getRemainingSeconds(claims), claims.sub)
    }

    async assertActive(claims: AccessTokenClaims): Promise<void> {
        const userUid = await this.redisService.get(this.getKey(claims.jti))
        if (userUid !== claims.sub) {
            throw new UnauthorizedException('登录会话已失效，请重新登录')
        }
    }

    async rotate(oldSessionId: string, claims: AccessTokenClaims): Promise<void> {
        await this.redisService.rotate(this.getKey(oldSessionId), this.getKey(claims.jti), this.getRemainingSeconds(claims), claims.sub)
    }

    async revoke(sessionId: string): Promise<void> {
        await this.redisService.del(this.getKey(sessionId))
    }

    private getKey(sessionId: string): string {
        return `${this.prefix}:${sessionId}`
    }

    private getRemainingSeconds(claims: AccessTokenClaims): number {
        return Math.max(1, claims.exp - Math.floor(Date.now() / 1000))
    }
}
