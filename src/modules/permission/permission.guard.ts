import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { AuthenticatedRequest, REQUIRED_PERMISSIONS } from '@wlisfes/chat-web-base-schema/auth'
import { FeignClientAuthManager } from '@wlisfes/chat-web-base-schema/feign'

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authClient: FeignClientAuthManager,
        private readonly configService: ConfigService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? []
        if (!required.length) {
            return true
        }
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (!request.user) {
            throw new ForbiddenException(`缺少权限：${required.join(', ')}`)
        }
        const serviceToken = this.configService.get<string>('gateway.feign.service_token')
        if (!serviceToken?.trim()) throw new ForbiddenException('缺少服务间鉴权配置')
        const allowed = await this.authClient.checkPermission(`Bearer ${serviceToken.trim().replace(/^Bearer\s+/i, '')}`, {
            uid: request.user.uid,
            permissionCodes: required
        })
        if (!allowed.allowed) throw new ForbiddenException(`缺少权限：${required.join(', ')}`)
        return true
    }
}
