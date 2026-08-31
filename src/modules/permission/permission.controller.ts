import { Get, Query } from '@nestjs/common'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { PermissionDataScopeQueryDto } from '@/modules/permission/dto/permission.dto'
import { PermissionService } from '@/modules/permission/permission.service'
import { EffectiveAccessResponseDto, EffectiveDataScopeResponseDto } from '@/dto/api-response.dto'

@ApifoxController('当前用户权限', 'permission', { bearerAuth: true })
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) {}

    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取当前用户的角色、权限码和菜单树' },
        response: { type: EffectiveAccessResponseDto, description: '当前用户有效权限' }
    })
    public async httpBaseAccountPermissionResolver(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.permissionService.httpBaseAccountPermissionResolver(principal)
    }

    @ApiServiceDecorator(Get('data/scope'), {
        operation: { summary: '获取当前用户对指定业务资源的有效数据范围' },
        request: { source: 'query', type: PermissionDataScopeQueryDto },
        response: { type: EffectiveDataScopeResponseDto, description: '指定资源的有效数据范围' }
    })
    public async httpBaseAccountPermissionDataScope(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Query() query: PermissionDataScopeQueryDto
    ) {
        return this.permissionService.httpBaseAccountPermissionDataScope(principal, query)
    }
}
