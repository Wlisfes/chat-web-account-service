import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { CurrentPrincipal, RequirePermissions, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { UserService } from '@/modules/user/user.service'
import * as UserDto from '@/modules/user/dto/user.dto'

@ApifoxController('账号与授权', 'user', { bearerAuth: true })
export class UserController {
    constructor(private readonly userService: UserService) {}

    @RequirePermissions('chat:deploy:system:user:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建账号并可原子设置组织和角色' },
        request: { source: 'body', type: UserDto.CreateUserDto },
        response: { type: UserDto.AccountUserResponseDto, description: '新增后的账号信息' }
    })
    public async httpBaseAccountCreateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UserDto.CreateUserDto) {
        return this.userService.httpBaseAccountCreateUser(principal, input)
    }

    @RequirePermissions('chat:deploy:system:user')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '按当前用户的数据范围分页查询账号' },
        request: { source: 'body', type: UserDto.UserQueryDto },
        response: { type: UserDto.UserPageResponseDto, description: '账号分页数据' }
    })
    public async httpBaseAccountColumnUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UserDto.UserQueryDto) {
        return this.userService.httpBaseAccountColumnUser(principal, input)
    }

    @RequirePermissions('chat:deploy:system:user')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '按当前用户的数据范围获取账号详情' },
        request: { source: 'query', type: UserDto.UserUidDto },
        response: { type: UserDto.UserDetailResponseDto, description: '账号详情' }
    })
    public async httpBaseAccountUserResolver(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: UserDto.UserUidDto) {
        return this.userService.httpBaseAccountUserResolver(principal, query)
    }

    @RequirePermissions('chat:deploy:system:user:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '按当前用户的数据范围更新账号资料和状态' },
        request: { source: 'body', type: UserDto.UpdateUserPayloadDto },
        response: { type: UserDto.AccountUserResponseDto, description: '更新后的账号信息' }
    })
    public async httpBaseAccountUpdateUser(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UserDto.UpdateUserPayloadDto) {
        return this.userService.httpBaseAccountUpdateUser(principal, input)
    }

    @RequirePermissions('chat:deploy:system:user:password:reset')
    @ApiServiceDecorator(Post('reset/password'), {
        operation: { summary: '超级管理员重置账号密码' },
        request: { source: 'body', type: UserDto.ResetUserPasswordPayloadDto },
        response: { type: SuccessResponseDataDto, description: '密码重置结果' }
    })
    public async httpBaseAccountResetUserPassword(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: UserDto.ResetUserPasswordPayloadDto
    ) {
        return this.userService.httpBaseAccountResetUserPassword(principal, input)
    }

    @RequirePermissions('chat:deploy:system:user:organization:assign')
    @ApiServiceDecorator(Post('update/organization'), {
        operation: { summary: '替换账号的主组织和兼任组织' },
        request: { source: 'body', type: UserDto.ReplaceUserOrganizationsPayloadDto },
        response: { type: SuccessResponseDataDto, description: '账号组织关系更新结果' }
    })
    public async httpBaseAccountUpdateUserOrganization(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: UserDto.ReplaceUserOrganizationsPayloadDto
    ) {
        return this.userService.httpBaseAccountUpdateUserOrganization(principal, input)
    }

    @RequirePermissions('chat:deploy:system:user:role:assign')
    @ApiServiceDecorator(Post('update/role'), {
        operation: { summary: '替换账号的全部角色' },
        request: { source: 'body', type: UserDto.ReplaceUserRolesPayloadDto },
        response: { type: SuccessResponseDataDto, description: '账号角色更新结果' }
    })
    public async httpBaseAccountUpdateUserRole(
        @CurrentPrincipal() principal: AuthPrincipal,
        @Body() input: UserDto.ReplaceUserRolesPayloadDto
    ) {
        return this.userService.httpBaseAccountUpdateUserRole(principal, input)
    }
}
