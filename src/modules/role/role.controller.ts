import { Body, Get, Post, Query } from '@nestjs/common'
import { CurrentPrincipal, RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountRoleDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import {
    CreateRoleDto,
    ReplaceRoleDataScopesPayloadDto,
    ReplaceRoleMenusPayloadDto,
    RoleKeyDto,
    UpdateRolePayloadDto
} from '@/modules/role/dto/role.dto'
import { RoleService } from '@/modules/role/role.service'
import { RoleResponseDto } from '@/dto/api-response.dto'

@ApifoxController('角色权限', 'role', { bearerAuth: true })
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @RequirePermissions('account:role:list')
    @ApiServiceDecorator(Get('select'), {
        operation: { summary: '获取角色列表' },
        response: { type: RoleResponseDto, isArray: true, description: '角色列表' }
    })
    httpBaseAccountSelectRole() {
        return this.roleService.findAll()
    }

    @RequirePermissions('account:role:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取角色、菜单和数据范围详情' },
        request: { source: 'query', type: RoleKeyDto },
        response: { type: RoleResponseDto, description: '角色权限详情' }
    })
    httpBaseAccountRoleResolver(@Query() query: RoleKeyDto) {
        return this.roleService.findOne(query.keyId)
    }

    @RequirePermissions('account:role:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建角色' },
        request: { source: 'body', type: CreateRoleDto },
        response: { type: TbAccountRoleDto, description: '新增后的角色' }
    })
    httpBaseAccountCreateRole(@Body() input: CreateRoleDto) {
        return this.roleService.create(input)
    }

    @RequirePermissions('account:role:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新角色' },
        request: { source: 'body', type: UpdateRolePayloadDto },
        response: { type: TbAccountRoleDto, description: '更新后的角色' }
    })
    httpBaseAccountUpdateRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateRolePayloadDto) {
        const { keyId, ...payload } = input
        return this.roleService.update(principal.uid, keyId, payload)
    }

    @RequirePermissions('account:role:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除未分配用户的非内置角色' },
        request: { source: 'body', type: RoleKeyDto },
        response: { type: SuccessResponseDataDto, description: '角色删除结果' }
    })
    async httpBaseAccountDeleteRole(@Body() input: RoleKeyDto) {
        await this.roleService.remove(input.keyId)
        return { success: true }
    }

    @RequirePermissions('account:role:grant')
    @ApiServiceDecorator(Post('update/menu'), {
        operation: { summary: '替换角色的全部菜单和按钮权限' },
        request: { source: 'body', type: ReplaceRoleMenusPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色菜单权限更新结果' }
    })
    async httpBaseAccountUpdateRoleMenu(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceRoleMenusPayloadDto) {
        await this.roleService.replaceMenus(principal.uid, input.keyId, input)
        return { success: true }
    }

    @RequirePermissions('account:role:grant')
    @ApiServiceDecorator(Post('update/data/scope'), {
        operation: { summary: '替换角色的全部资源数据范围' },
        request: { source: 'body', type: ReplaceRoleDataScopesPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色数据范围更新结果' }
    })
    async httpBaseAccountUpdateRoleDataScope(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceRoleDataScopesPayloadDto) {
        await this.roleService.replaceDataScopes(principal.uid, input.keyId, input)
        return { success: true }
    }
}
