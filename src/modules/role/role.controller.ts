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
    @ApiServiceDecorator(Get('/configer'), {
        operation: { summary: '获取通用角色列表和岗位角色树' },
        response: { type: RoleDto.RoleConfigerResponseDto, description: '角色配置数据' }
    })
    public async httpBaseAccountRoleConfiger() {
        return this.roleService.httpBaseAccountRoleConfiger()
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
    public async httpBaseAccountCreateRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: RoleDto.CreateRoleDto) {
        return this.roleService.httpBaseAccountCreateRole(principal, input)
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

    @RequirePermissions('chat:deploy:system:role:update')
    @ApiServiceDecorator(Post('/sort/update'), {
        operation: { summary: '批量更新角色排序' },
        request: { source: 'body', type: RoleDto.UpdateRoleSortPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色排序更新结果' }
    })
    public async httpBaseAccountUpdateRoleSort(@Body() input: RoleDto.UpdateRoleSortPayloadDto) {
        return this.roleService.httpBaseAccountUpdateRoleSort(input)
    }

    @RequirePermissions('chat:deploy:system:role:update')
    @ApiServiceDecorator(Post('/update/sheet'), {
        operation: { summary: '替换角色的全部菜单和按钮权限' },
        request: { source: 'body', type: RoleDto.ReplaceRoleSheetsPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色菜单权限更新结果' }
    })
    public async httpBaseAccountUpdateRoleSheet(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: RoleDto.ReplaceRoleSheetsPayloadDto
    ) {
        return this.roleService.httpBaseAccountUpdateRoleSheet(principal, input)
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

    @RequirePermissions('chat:deploy:system:role:link:user')
    @ApiServiceDecorator(Post('/link/user'), {
        operation: { summary: '批量关联角色用户' },
        request: { source: 'body', type: RoleDto.RoleUserPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色用户关联结果' }
    })
    public async httpBaseAccountRoleLinkUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: RoleDto.RoleUserPayloadDto) {
        return this.roleService.httpBaseAccountRoleLinkUser(principal, input)
    }

    @RequirePermissions('chat:deploy:system:role:unlink:user')
    @ApiServiceDecorator(Post('/unlink/user'), {
        operation: { summary: '批量移除角色用户' },
        request: { source: 'body', type: RoleDto.RoleUserPayloadDto },
        response: { type: SuccessResponseDataDto, description: '角色用户移除结果' }
    })
    public async httpBaseAccountRoleUnlinkUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: RoleDto.RoleUserPayloadDto) {
        return this.roleService.httpBaseAccountRoleUnlinkUser(principal, input)
    }
}
