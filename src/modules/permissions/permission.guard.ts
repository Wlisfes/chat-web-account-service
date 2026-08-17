import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUIRED_PERMISSIONS } from '@/modules/auth/auth.decorator'
import { AuthenticatedRequest } from '@/modules/auth/auth.interface'
import { PermissionsService } from '@/modules/permissions/permissions.service'

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionsService: PermissionsService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? []
        if (!required.length) {
            return true
        }
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (!request.user || !(await this.permissionsService.hasPermission(request.user.uid, required))) {
            throw new ForbiddenException(`缺少权限：${required.join(', ')}`)
        }
        return true
    }
}
