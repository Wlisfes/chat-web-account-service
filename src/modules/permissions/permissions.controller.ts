import { Controller, Get, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { PermissionsService } from '@/modules/permissions/permissions.service'

@ApiTags('当前用户权限')
@ApiBearerAuth('authorization')
@Controller('permissions/me')
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) {}

    @Get()
    @ApiOperation({ summary: '获取当前用户的角色、权限码和菜单树' })
    getEffectiveAccess(@CurrentPrincipal() principal: AuthPrincipal) {
        return this.permissionsService.getEffectiveAccess(principal.uid)
    }

    @Get('data-scopes/:resourceCode')
    @ApiOperation({ summary: '获取当前用户对指定业务资源的有效数据范围' })
    getDataScope(@CurrentPrincipal() principal: AuthPrincipal, @Param('resourceCode') resourceCode: string) {
        return this.permissionsService.resolveDataScope(principal.uid, resourceCode)
    }
}
