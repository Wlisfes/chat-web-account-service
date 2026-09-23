import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { RequirePermissions, CurrentPrincipal, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { TbAccountRoleDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { RoleService } from '@/modules/role/role.service'
import * as RoleDto from '@/modules/role/dto/role.dto'

@ApifoxController('角色权限', '/role', { bearerAuth: true })
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @RequirePermissions('chat:deploy:system:role')
    @ApiServiceDecorator(Get('enums'), {
        operation: { summary: '获取角色状态和数据范围枚举' },
        response: { type: RoleDto.RoleEnumsResponseDto, description: '角色静态枚举' }
    })
    public async httpBaseAccountRoleEnums() {
        return this.roleService.httpBaseAccountRoleEnums()
    }

    @RequirePermissions('chat:deploy:system:role')
    @ApiServiceDecorator(Get('/select'), {
        operation: { summary: '获取角色列表' },
        response: { type: RoleDto.RoleResponseDto, isArray: true, description: '角色列表' }
    })
    public async httpBaseAccountSelectRole() {
        return this.roleService.httpBaseAccountSelectRole()
    }

    @RequirePermissions('chat:deploy:system:role')
    @ApiServiceDecorator(Get('/resolve'), {
        operation: { summary: '获取角色、菜单和数据范围详情' },
        request: { source: 'query', type: RoleDto.RoleKeyDto },
        response: { type: RoleDto.RoleResponseDto, description: '角色权限详情' }
    })
    public async httpBaseAccountRoleResolver(@Query() query: RoleDto.RoleKeyDto) {
        return this.roleService.httpBaseAccountRoleResolver(query)
    }

    @RequirePermissions('chat:deploy:system:role:create')
    @ApiServiceDecorator(Post('/create'), {
        operation: { summary: '创建角色' },
        request: { source: 'body', type: RoleDto.CreateRoleDto },
        response: { type: TbAccountRoleDto, description: '新增后的角色' }
    })
    public async httpBaseAccountCreateRole(@Body() input: RoleDto.CreateRoleDto) {
        return this.roleService.httpBaseAccountCreateRole(input)
    }

    @RequirePermissions('chat:deploy:system:role:update')
    @ApiServiceDecorator(Post('/update'), {
        operation: { summary: '更新角色' },
        request: { source: 'body', type: RoleDto.UpdateRolePayloadDto },
        response: { type: TbAccountRoleDto, description: '更新后的角色' }
    })
    public async httpBaseAccountUpdateRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: RoleDto.UpdateRolePayloadDto) {
        return this.roleService.httpBaseAccountUpdateRole(principal, input)
    }

    @RequirePermissions('chat:deploy:system:role:delete')
    @ApiServiceDecorator(Post('/delete'), {
        operation: { summary: '删除未分配用户的非内置角色' },
        request: { source: 'body', type: RoleDto.RoleKeyDto },
        response: { type: SuccessResponseDataDto, description: '角色删除结果' }
    })
    public async httpBaseAccountDeleteRole(@Body() input: RoleDto.RoleKeyDto) {
        return this.roleService.httpBaseAccountDeleteRole(input)
    }

    @RequirePermissions('chat:deploy:system:role:authorize')
    @ApiServiceDecorator(Post('/update/menu'), {
        operation: { summary: '替换角色的全部菜单和按钮权限' },
        request: { source: 'body', type: RoleDto.ReplaceRoleMenusPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色菜单权限更新结果' }
    })
    public async httpBaseAccountUpdateRoleMenu(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: RoleDto.ReplaceRoleMenusPayloadDto
    ) {
        return this.roleService.httpBaseAccountUpdateRoleMenu(principal, input)
    }

    @RequirePermissions('chat:deploy:system:role:authorize')
    @ApiServiceDecorator(Post('/update/data/scope'), {
        operation: { summary: '替换角色的全部资源数据范围' },
        request: { source: 'body', type: RoleDto.ReplaceRoleDataScopesPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色数据范围更新结果' }
    })
    public async httpBaseAccountUpdateRoleDataScope(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: RoleDto.ReplaceRoleDataScopesPayloadDto
    ) {
        return this.roleService.httpBaseAccountUpdateRoleDataScope(principal, input)
    }
}
