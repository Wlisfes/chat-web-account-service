import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    CreateRoleDto,
    ReplaceRoleDataScopesPayloadDto,
    ReplaceRoleMenusPayloadDto,
    RoleKeyDto,
    UpdateRolePayloadDto
} from '@/modules/role/dto/role.dto'
import { RoleService } from '@/modules/role/role.service'

@ApiTags('角色权限')
@ApiBearerAuth('authorization')
@Controller('role')
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get('select')
    @RequirePermissions('account:role:list')
    @ApiOperation({ summary: '获取角色列表' })
    httpBaseAccountSelectRole() {
        return this.roleService.findAll()
    }

    @Get('resolver')
    @RequirePermissions('account:role:list')
    @ApiOperation({ summary: '获取角色、菜单和数据范围详情' })
    httpBaseAccountRoleResolver(@Query() query: RoleKeyDto) {
        return this.roleService.findOne(query.keyId)
    }

    @Post('create')
    @RequirePermissions('account:role:create')
    @ApiOperation({ summary: '创建角色' })
    httpBaseAccountCreateRole(@Body() input: CreateRoleDto) {
        return this.roleService.create(input)
    }

    @Post('update')
    @RequirePermissions('account:role:update')
    @ApiOperation({ summary: '更新角色' })
    httpBaseAccountUpdateRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateRolePayloadDto) {
        const { keyId, ...payload } = input
        return this.roleService.update(principal.uid, keyId, payload)
    }

    @Post('delete')
    @RequirePermissions('account:role:delete')
    @ApiOperation({ summary: '删除未分配用户的非内置角色' })
    async httpBaseAccountDeleteRole(@Body() input: RoleKeyDto) {
        await this.roleService.remove(input.keyId)
        return { success: true }
    }

    @Post('update/menu')
    @RequirePermissions('account:role:grant')
    @ApiOperation({ summary: '替换角色的全部菜单和按钮权限' })
    async httpBaseAccountUpdateRoleMenu(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceRoleMenusPayloadDto) {
        await this.roleService.replaceMenus(principal.uid, input.keyId, input)
        return { success: true }
    }

    @Post('update/data/scope')
    @RequirePermissions('account:role:grant')
    @ApiOperation({ summary: '替换角色的全部资源数据范围' })
    async httpBaseAccountUpdateRoleDataScope(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceRoleDataScopesPayloadDto) {
        await this.roleService.replaceDataScopes(principal.uid, input.keyId, input)
        return { success: true }
    }
}
