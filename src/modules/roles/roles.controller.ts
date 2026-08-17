import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermissions } from '@/modules/auth/auth.decorator'
import { CurrentPrincipal } from '@/modules/auth/auth.decorator'
import type { AuthPrincipal } from '@/modules/auth/auth.interface'
import { CreateRoleDto, ReplaceRoleDataScopesDto, ReplaceRoleMenusDto, UpdateRoleDto } from '@/modules/roles/dto/role.dto'
import { RolesService } from '@/modules/roles/roles.service'

@ApiTags('角色权限')
@ApiBearerAuth('authorization')
@Controller('roles')
export class RolesController {
    constructor(private readonly rolesService: RolesService) {}

    @Get()
    @RequirePermissions('account:role:list')
    @ApiOperation({ summary: '获取角色列表' })
    findAll() {
        return this.rolesService.findAll()
    }

    @Get(':uid')
    @RequirePermissions('account:role:list')
    @ApiOperation({ summary: '获取角色、菜单和数据范围详情' })
    findOne(@Param('uid') uid: string) {
        return this.rolesService.findOne(uid)
    }

    @Post()
    @RequirePermissions('account:role:create')
    @ApiOperation({ summary: '创建角色' })
    create(@Body() input: CreateRoleDto) {
        return this.rolesService.create(input)
    }

    @Patch(':uid')
    @RequirePermissions('account:role:update')
    @ApiOperation({ summary: '更新角色' })
    update(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string, @Body() input: UpdateRoleDto) {
        return this.rolesService.update(principal.uid, uid, input)
    }

    @Delete(':uid')
    @RequirePermissions('account:role:delete')
    @ApiOperation({ summary: '删除未分配用户的非内置角色' })
    async remove(@Param('uid') uid: string) {
        await this.rolesService.remove(uid)
        return { success: true }
    }

    @Put(':uid/menus')
    @RequirePermissions('account:role:grant')
    @ApiOperation({ summary: '替换角色的全部菜单和按钮权限' })
    async replaceMenus(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string, @Body() input: ReplaceRoleMenusDto) {
        await this.rolesService.replaceMenus(principal.uid, uid, input)
        return { success: true }
    }

    @Put(':uid/data-scopes')
    @RequirePermissions('account:role:grant')
    @ApiOperation({ summary: '替换角色的全部资源数据范围' })
    async replaceDataScopes(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Param('uid') uid: string,
        @Body() input: ReplaceRoleDataScopesDto
    ) {
        await this.rolesService.replaceDataScopes(principal.uid, uid, input)
        return { success: true }
    }
}
