import { Body, Get, Post, Query } from '@nestjs/common'
import { CurrentPrincipal, RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
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
import { AccountUserResponseDto, UserDetailResponseDto, UserPageResponseDto } from '@/dto/api-response.dto'

@ApifoxController('账号与授权', 'user', { bearerAuth: true })
export class UserController {
    constructor(private readonly userService: UserService) {}

    @RequirePermissions('account:user:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建账号并可原子设置组织和角色' },
        request: { source: 'body', type: CreateUserDto },
        response: { type: AccountUserResponseDto, description: '新增后的账号信息' }
    })
    httpBaseAccountCreateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateUserDto) {
        return this.userService.create(principal.uid, input)
    }

    @RequirePermissions('account:user:list')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '按当前用户的数据范围分页查询账号' },
        request: { source: 'body', type: UserQueryDto },
        response: { type: UserPageResponseDto, description: '账号分页数据' }
    })
    httpBaseAccountColumnUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UserQueryDto) {
        return this.userService.findPage(principal.uid, input)
    }

    @RequirePermissions('account:user:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '按当前用户的数据范围获取账号详情' },
        request: { source: 'query', type: UserUidDto },
        response: { type: UserDetailResponseDto, description: '账号详情' }
    })
    httpBaseAccountUserResolver(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: UserUidDto) {
        return this.userService.findOne(principal.uid, query.uid)
    }

    @RequirePermissions('account:user:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '按当前用户的数据范围更新账号资料和状态' },
        request: { source: 'body', type: UpdateUserPayloadDto },
        response: { type: AccountUserResponseDto, description: '更新后的账号信息' }
    })
    httpBaseAccountUpdateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateUserPayloadDto) {
        const { uid, ...payload } = input
        return this.userService.update(principal.uid, uid, payload)
    }

    @RequirePermissions('account:user:password:reset')
    @ApiServiceDecorator(Post('reset/password'), {
        operation: { summary: '超级管理员重置账号密码' },
        request: { source: 'body', type: ResetUserPasswordPayloadDto },
        response: { type: SuccessResponseDataDto, description: '密码重置结果' }
    })
    async httpBaseAccountResetUserPassword(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ResetUserPasswordPayloadDto) {
        await this.userService.resetPassword(principal.uid, input.uid, input)
        return { success: true }
    }

    @RequirePermissions('account:user:organization:assign')
    @ApiServiceDecorator(Post('update/organization'), {
        operation: { summary: '替换账号的主组织和兼任组织' },
        request: { source: 'body', type: ReplaceUserOrganizationsPayloadDto },
        response: { type: SuccessResponseDataDto, description: '账号组织关系更新结果' }
    })
    async httpBaseAccountUpdateUserOrganization(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: ReplaceUserOrganizationsPayloadDto
    ) {
        await this.userService.replaceOrganizations(principal.uid, input.uid, input)
        return { success: true }
    }

    @RequirePermissions('account:user:role:assign')
    @ApiServiceDecorator(Post('update/role'), {
        operation: { summary: '替换账号的全部角色' },
        request: { source: 'body', type: ReplaceUserRolesPayloadDto },
        response: { type: SuccessResponseDataDto, description: '账号角色更新结果' }
    })
    async httpBaseAccountUpdateUserRole(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: ReplaceUserRolesPayloadDto) {
        await this.userService.replaceRoles(principal.uid, input.uid, input)
        return { success: true }
    }
}
