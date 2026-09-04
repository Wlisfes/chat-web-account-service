import {
    CanActivate,
    ExecutionContext,
    Injectable,
    OnApplicationBootstrap,
    ServiceUnavailableException,
    UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

/**
 * 校验仅允许服务间调用的认证接口凭据。
 *
 * 用户访问令牌放在请求体中，服务间凭据单独使用 X-Service-Token，避免把两种凭据
 * 都塞进 Authorization 头部，也避免内部接口被普通用户直接调用。
 */
@Injectable()
export class InternalAuthGuard implements CanActivate, OnApplicationBootstrap {
    constructor(private readonly configService: ConfigService) {}

    /** 内部认证是网关入口认证的必要依赖，配置缺失时阻止账号服务启动。 */
    public onApplicationBootstrap(): void {
        if (!this.resolveConfiguredToken()) {
            throw new Error('Nacos 配置 feign.service_token 未配置，无法提供内部认证服务')
        }
    }

    public canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>()
        const provided = request.header('x-service-token')
        const configured = this.resolveConfiguredToken()
        if (!configured) {
            throw new ServiceUnavailableException('Nacos 配置 feign.service_token 未配置，无法提供内部认证服务')
        }
        if (!provided || !this.secureEquals(this.normalizeToken(provided), configured)) {
            throw new UnauthorizedException('内部认证服务凭据无效')
        }
        return true
    }

    private resolveConfiguredToken(): string | undefined {
        const configured = this.configService.get<unknown>('feign.service_token')
        if (typeof configured !== 'string' || !configured.trim()) return undefined
        return this.normalizeToken(configured)
    }

    private normalizeToken(value: string): string {
        return value.trim().replace(/^Bearer\s+/i, '')
    }

    private secureEquals(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(left)
        const rightBuffer = Buffer.from(right)
        return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
    }
}
