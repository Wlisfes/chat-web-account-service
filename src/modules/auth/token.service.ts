import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessTokenClaims } from '@/modules/auth/auth.interface'

type JwtHeader = {
    alg: string
    typ: string
}

@Injectable()
export class TokenService {
    constructor(private readonly configService: ConfigService) {}

    issueAccessToken(userUid: string): { accessToken: string; tokenType: 'Bearer'; expiresIn: number; claims: AccessTokenClaims } {
        const now = Math.floor(Date.now() / 1000)
        const expiresIn = this.getTtlSeconds()
        const header: JwtHeader = { alg: 'HS256', typ: 'JWT' }
        const claims: AccessTokenClaims = {
            sub: userUid,
            iss: this.getIssuer(),
            aud: this.getAudience(),
            iat: now,
            exp: now + expiresIn,
            jti: randomUUID()
        }
        const encodedHeader = this.encodeJson(header)
        const encodedClaims = this.encodeJson(claims)
        const signingInput = `${encodedHeader}.${encodedClaims}`
        const signature = this.sign(signingInput)
        return { accessToken: `${signingInput}.${signature}`, tokenType: 'Bearer', expiresIn, claims }
    }

    verifyAccessToken(token: string): AccessTokenClaims {
        if (!token || token.length > 4096) {
            throw new UnauthorizedException('访问令牌无效')
        }

        const parts = token.split('.')
        if (parts.length !== 3 || parts.some(part => !part)) {
            throw new UnauthorizedException('访问令牌格式错误')
        }

        const [encodedHeader, encodedClaims, encodedSignature] = parts
        const header = this.decodeJson<JwtHeader>(encodedHeader)
        const claims = this.decodeJson<AccessTokenClaims>(encodedClaims)
        if (!header || typeof header !== 'object' || header.alg !== 'HS256' || header.typ !== 'JWT') {
            throw new UnauthorizedException('访问令牌算法无效')
        }

        const expectedSignature = Buffer.from(this.sign(`${encodedHeader}.${encodedClaims}`), 'base64url')
        const actualSignature = Buffer.from(encodedSignature, 'base64url')
        if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
            throw new UnauthorizedException('访问令牌签名无效')
        }

        const now = Math.floor(Date.now() / 1000)
        if (
            !claims ||
            typeof claims !== 'object' ||
            typeof claims.sub !== 'string' ||
            !/^\d{1,19}$/.test(claims.sub) ||
            claims.iss !== this.getIssuer() ||
            claims.aud !== this.getAudience() ||
            !Number.isInteger(claims.iat) ||
            !Number.isInteger(claims.exp) ||
            claims.exp <= now ||
            claims.iat > now + 60 ||
            typeof claims.jti !== 'string' ||
            !claims.jti
        ) {
            throw new UnauthorizedException('访问令牌声明无效或已过期')
        }
        return claims
    }

    private encodeJson(value: object): string {
        return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
    }

    private decodeJson<TValue>(value: string): TValue {
        try {
            return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TValue
        } catch {
            throw new UnauthorizedException('访问令牌内容无效')
        }
    }

    private sign(value: string): string {
        return createHmac('sha256', this.getSecret()).update(value).digest('base64url')
    }

    private getSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET') || this.configService.get<string>('security.jwt.secret')
        if (typeof secret !== 'string' || secret.length < 32) {
            throw new Error('JWT 密钥 security.jwt.secret 或 JWT_SECRET 必须至少32位')
        }
        return secret
    }

    private getIssuer(): string {
        return this.configService.get<string>('security.jwt.issuer')?.trim() || 'chat-web-account-service'
    }

    private getAudience(): string {
        return this.configService.get<string>('security.jwt.audience')?.trim() || 'chat-web'
    }

    private getTtlSeconds(): number {
        const value = Number(this.configService.get<number | string>('security.jwt.accessTokenTtlSeconds', 3600))
        if (!Number.isInteger(value) || value < 60 || value > 86_400) {
            throw new Error('security.jwt.accessTokenTtlSeconds 必须是60-86400之间的整数')
        }
        return value
    }
}
