import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthenticatedRequest, REQUIRED_PERMISSIONS } from '@wlisfes/chat-web-base-schema/auth'
import { PermissionService } from '@/modules/permission/permission.service'

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionService: PermissionService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? []
        if (!required.length) {
            return true
        }
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (!request.user || !(await this.permissionService.hasPermission(request.user.uid, required))) {
            throw new ForbiddenException(`缺少权限：${required.join(', ')}`)
        }
        return true
    }
}
