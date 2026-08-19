import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    CreateUserDto,
    ReplaceUserOrganizationsDto,
    ReplaceUserRolesDto,
    ResetUserPasswordDto,
    UpdateUserDto,
    UserQueryDto
} from '@/modules/users/dto/user.dto'
import { UsersService } from '@/modules/users/users.service'

@ApiTags('账号与授权')
@ApiBearerAuth('authorization')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post()
    @RequirePermissions('account:user:create')
    @ApiOperation({ summary: '创建账号并可原子设置组织和角色' })
    create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateUserDto) {
        return this.usersService.create(principal.uid, input)
    }

    @Get()
    @RequirePermissions('account:user:list')
    @ApiOperation({ summary: '按当前用户的数据范围分页查询账号' })
    findPage(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: UserQueryDto) {
        return this.usersService.findPage(principal.uid, query)
    }

    @Get(':uid')
    @RequirePermissions('account:user:list')
    @ApiOperation({ summary: '按当前用户的数据范围获取账号详情' })
    findOne(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string) {
        return this.usersService.findOne(principal.uid, uid)
    }

    @Patch(':uid')
    @RequirePermissions('account:user:update')
    @ApiOperation({ summary: '按当前用户的数据范围更新账号资料和状态' })
    update(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string, @Body() input: UpdateUserDto) {
        return this.usersService.update(principal.uid, uid, input)
    }

    @Put(':uid/password')
    @RequirePermissions('account:user:password:reset')
    @ApiOperation({ summary: '超级管理员重置账号密码' })
    async resetPassword(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string, @Body() input: ResetUserPasswordDto) {
        await this.usersService.resetPassword(principal.uid, uid, input)
        return { success: true }
    }

    @Put(':uid/organizations')
    @RequirePermissions('account:user:organization:assign')
    @ApiOperation({ summary: '替换账号的主组织和兼任组织' })
    async replaceOrganizations(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Param('uid') uid: string,
        @Body() input: ReplaceUserOrganizationsDto
    ) {
        await this.usersService.replaceOrganizations(principal.uid, uid, input)
        return { success: true }
    }

    @Put(':uid/roles')
    @RequirePermissions('account:user:role:assign')
    @ApiOperation({ summary: '替换账号的全部角色' })
    async replaceRoles(@CurrentPrincipal() principal: AuthPrincipal, @Param('uid') uid: string, @Body() input: ReplaceUserRolesDto) {
        await this.usersService.replaceRoles(principal.uid, uid, input)
        return { success: true }
    }
}
