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
    public async httpBaseAccountSelectRole() {
        return this.roleService.httpBaseAccountSelectRole()
    }

    @RequirePermissions('account:role:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取角色、菜单和数据范围详情' },
        request: { source: 'query', type: RoleKeyDto },
        response: { type: RoleResponseDto, description: '角色权限详情' }
    })
    public async httpBaseAccountRoleResolver(@Query() query: RoleKeyDto) {
        return this.roleService.httpBaseAccountRoleResolver(query)
    }

    @RequirePermissions('account:role:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建角色' },
        request: { source: 'body', type: CreateRoleDto },
        response: { type: TbAccountRoleDto, description: '新增后的角色' }
    })
    public async httpBaseAccountCreateRole(@Body() input: CreateRoleDto) {
        return this.roleService.httpBaseAccountCreateRole(input)
    }

    @RequirePermissions('account:role:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新角色' },
        request: { source: 'body', type: UpdateRolePayloadDto },
        response: { type: TbAccountRoleDto, description: '更新后的角色' }
    })
    public async httpBaseAccountUpdateRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateRolePayloadDto) {
        return this.roleService.httpBaseAccountUpdateRole(principal, input)
    }

    @RequirePermissions('account:role:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除未分配用户的非内置角色' },
        request: { source: 'body', type: RoleKeyDto },
        response: { type: SuccessResponseDataDto, description: '角色删除结果' }
    })
    public async httpBaseAccountDeleteRole(@Body() input: RoleKeyDto) {
        return this.roleService.httpBaseAccountDeleteRole(input)
    }

    @RequirePermissions('account:role:grant')
    @ApiServiceDecorator(Post('update/menu'), {
        operation: { summary: '替换角色的全部菜单和按钮权限' },
        request: { source: 'body', type: ReplaceRoleMenusPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色菜单权限更新结果' }
    })
    public async httpBaseAccountUpdateRoleMenu(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceRoleMenusPayloadDto) {
        return this.roleService.httpBaseAccountUpdateRoleMenu(principal, input)
    }

    @RequirePermissions('account:role:grant')
    @ApiServiceDecorator(Post('update/data/scope'), {
        operation: { summary: '替换角色的全部资源数据范围' },
        request: { source: 'body', type: ReplaceRoleDataScopesPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色数据范围更新结果' }
    })
    public async httpBaseAccountUpdateRoleDataScope(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: ReplaceRoleDataScopesPayloadDto
    ) {
        return this.roleService.httpBaseAccountUpdateRoleDataScope(principal, input)
    }
}
