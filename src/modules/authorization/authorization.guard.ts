import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthenticatedRequest, REQUIRED_PERMISSIONS } from '@wlisfes/chat-web-base-schema/auth'
import { AuthorizationService } from '@/modules/authorization/authorization.service'

/** 根据 RequirePermissions 元数据调用 Auth 权限中心进行统一授权。 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authorizationService: AuthorizationService
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? []
        if (!required.length) return true
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (!request.user || !(await this.authorizationService.hasPermission(request.user.uid, required))) {
            throw new ForbiddenException(`缺少权限：${required.join(', ')}`)
        }
        return true
    }
}
