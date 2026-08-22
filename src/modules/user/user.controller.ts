import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    CreateUserDto,
    ReplaceUserOrganizationsPayloadDto,
    ReplaceUserRolesPayloadDto,
    ResetUserPasswordPayloadDto,
    UpdateUserPayloadDto,
    UserUidDto,
    UserQueryDto
} from '@/modules/user/dto/user.dto'
import { UserService } from '@/modules/user/user.service'

@ApiTags('账号与授权')
@ApiBearerAuth('authorization')
@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post('create')
    @RequirePermissions('account:user:create')
    @ApiOperation({ summary: '创建账号并可原子设置组织和角色' })
    httpBaseAccountCreateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateUserDto) {
        return this.userService.create(principal.uid, input)
    }

    @Post('column')
    @RequirePermissions('account:user:list')
    @ApiOperation({ summary: '按当前用户的数据范围分页查询账号' })
    httpBaseAccountColumnUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UserQueryDto) {
        return this.userService.findPage(principal.uid, input)
    }

    @Get('resolver')
    @RequirePermissions('account:user:list')
    @ApiOperation({ summary: '按当前用户的数据范围获取账号详情' })
    httpBaseAccountUserResolver(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: UserUidDto) {
        return this.userService.findOne(principal.uid, query.uid)
    }

    @Post('update')
    @RequirePermissions('account:user:update')
    @ApiOperation({ summary: '按当前用户的数据范围更新账号资料和状态' })
    httpBaseAccountUpdateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateUserPayloadDto) {
        const { uid, ...payload } = input
        return this.userService.update(principal.uid, uid, payload)
    }

    @Post('reset/password')
    @RequirePermissions('account:user:password:reset')
    @ApiOperation({ summary: '超级管理员重置账号密码' })
    async httpBaseAccountResetUserPassword(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ResetUserPasswordPayloadDto) {
        await this.userService.resetPassword(principal.uid, input.uid, input)
        return { success: true }
    }

    @Post('update/organization')
    @RequirePermissions('account:user:organization:assign')
    @ApiOperation({ summary: '替换账号的主组织和兼任组织' })
    async httpBaseAccountUpdateUserOrganization(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: ReplaceUserOrganizationsPayloadDto
    ) {
        await this.userService.replaceOrganizations(principal.uid, input.uid, input)
        return { success: true }
    }

    @Post('update/role')
    @RequirePermissions('account:user:role:assign')
    @ApiOperation({ summary: '替换账号的全部角色' })
    async httpBaseAccountUpdateUserRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceUserRolesPayloadDto) {
        await this.userService.replaceRoles(principal.uid, input.uid, input)
        return { success: true }
    }
}
