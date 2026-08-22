import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { PermissionDataScopeQueryDto } from '@/modules/permission/dto/permission.dto'
import { PermissionService } from '@/modules/permission/permission.service'

@ApiTags('当前用户权限')
@ApiBearerAuth('authorization')
@Controller('permission')
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) {}

    @Get('resolver')
    @ApiOperation({ summary: '获取当前用户的角色、权限码和菜单树' })
    httpBaseAccountPermissionResolver(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.permissionService.getEffectiveAccess(principal.uid)
    }

    @Get('data/scope')
    @ApiOperation({ summary: '获取当前用户对指定业务资源的有效数据范围' })
    httpBaseAccountPermissionDataScope(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: PermissionDataScopeQueryDto) {
        return this.permissionService.resolveDataScope(principal.uid, query.resourceCode)
    }
}
