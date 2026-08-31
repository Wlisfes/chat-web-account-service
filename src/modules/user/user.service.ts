import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { assertUid, generateUid, PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { Brackets, Repository } from 'typeorm'
import { AccountUserResponseDto, UserDetailResponseDto } from '@/dto/api-response.dto'
import { PasswordService } from '@/modules/auth/password.service'
import * as UserDto from '@/modules/user/dto/user.dto'
import { UserUtilsService } from '@/modules/user/user.utils.service'

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(TbAccountUser) private readonly userRepository: Repository<TbAccountUser>,
        private readonly database: DataBaseService,
        private readonly passwordService: PasswordService,
        private readonly userUtilsService: UserUtilsService
    ) {}

    /**新增账号*/
    public async httpBaseAccountCreateUser(principal: AuthPrincipal, input: UserDto.CreateUserDto): Promise<AccountUserResponseDto> {
        const memberships = input.memberships ?? []
        const roleKeyIds = input.roleKeyIds ?? []
        this.userUtilsService.findMembershipsRequired(memberships)
        await this.userUtilsService.findCanAssignOrganizations(
            principal.uid,
            memberships.map(item => item.organizationKeyId)
        )
        if (roleKeyIds.length > 0) {
            await this.userUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以在创建账号时分配角色')
        }

        return this.userRepository.manager.transaction(async manager => {
            await this.userUtilsService.findUserUnique(manager, input)
            await this.userUtilsService.findOrganizationsRequired(
                manager,
                memberships.map(item => item.organizationKeyId)
            )
            await this.userUtilsService.findRolesRequired(manager, roleKeyIds)
            const { memberships: _memberships, roleKeyIds: _roleKeyIds, password, ...fields } = input
            const user = manager.create(TbAccountUser, {
                ...fields,
                uid: generateUid(),
                password: await this.passwordService.hash(password)
            })
            const saved = await manager.save(user)
            await this.userUtilsService.insertMemberships(manager, saved.uid, memberships)
            await this.userUtilsService.insertRoles(manager, saved.uid, roleKeyIds)
            saved.password = undefined as unknown as string
            return saved
        })
    }

    /**账号分页数据*/
    public async httpBaseAccountColumnUser(
        principal: AuthPrincipal,
        input: UserDto.UserQueryDto
    ): Promise<PageResult<UserDetailResponseDto>> {
        return this.database.builder(this.userRepository, async qb => {
            await this.userUtilsService.applyDataScope(qb, principal.uid)
            if (isNotEmpty(input.vague?.trim())) {
                const vague = `%${this.userUtilsService.escapeLike(input.vague?.trim() ?? '')}%`
                qb.andWhere(
                    new Brackets(where => {
                        where
                            .where("t.number LIKE :vague ESCAPE '\\\\'", { vague })
                            .orWhere("t.name LIKE :vague ESCAPE '\\\\'", { vague })
                            .orWhere("t.phone LIKE :vague ESCAPE '\\\\'", { vague })
                            .orWhere("t.email LIKE :vague ESCAPE '\\\\'", { vague })
                    })
                )
            }
            if (isNotEmpty(input.status)) {
                qb.andWhere('t.status = :status', { status: input.status })
            }
            if ((input.organizationKeyIds?.length ?? 0) > 0) {
                qb.andWhere(
                    `EXISTS (
                        SELECT 1
                        FROM tb_account_user_organization filter_user_org
                        WHERE filter_user_org.user_uid = t.uid
                          AND filter_user_org.organization_key_id IN (:...filterOrganizationKeyIds)
                          AND filter_user_org.status = :filterMembershipStatus
                    )`,
                    {
                        filterOrganizationKeyIds: input.organizationKeyIds,
                        filterMembershipStatus: TbAccountUserOrganizationStatus.ENABLED
                    }
                )
            }
            if (isNotEmpty(input.roleKeyId)) {
                qb.andWhere(
                    `EXISTS (
                        SELECT 1
                        FROM tb_account_user_role filter_user_role
                        WHERE filter_user_role.user_uid = t.uid
                          AND filter_user_role.role_key_id = :filterRoleKeyId
                    )`,
                    { filterRoleKeyId: input.roleKeyId }
                )
            }
            qb.orderBy('t.keyId', 'DESC')
                .skip((input.page - 1) * input.size)
                .take(input.size)
            const [users, total] = await qb.getManyAndCount()
            return {
                page: input.page,
                size: input.size,
                total,
                list: await this.userUtilsService.enrichUsers(users)
            }
        })
    }

    /**账号详情*/
    public async httpBaseAccountUserResolver(principal: AuthPrincipal, query: UserDto.UserUidDto): Promise<UserDetailResponseDto> {
        return this.userUtilsService.findDetail(principal.uid, query.uid)
    }

    /**编辑账号*/
    public async httpBaseAccountUpdateUser(principal: AuthPrincipal, input: UserDto.UpdateUserPayloadDto): Promise<AccountUserResponseDto> {
        const { uid, ...fields } = input
        const targetUid = assertUid(uid, '账号UID')
        await this.userUtilsService.findCanAccessUser(principal.uid, targetUid)
        return this.userRepository.manager.transaction(async manager => {
            const user = await this.userUtilsService.lockUser(manager, targetUid)
            await this.userUtilsService.findUserUnique(manager, fields, targetUid)
            manager.merge(TbAccountUser, user, fields)
            return manager.save(user)
        })
    }

    /**重置账号密码*/
    public async httpBaseAccountResetUserPassword(
        principal: AuthPrincipal,
        input: UserDto.ResetUserPasswordPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.userUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以重置其他账号密码')
        const targetUid = assertUid(input.uid, '账号UID')
        const password = await this.passwordService.hash(input.password)
        await this.userRepository.manager.transaction(async manager => {
            await this.userUtilsService.lockUser(manager, targetUid)
            await manager.update(TbAccountUser, { uid: targetUid }, { password })
        })
        return { success: true }
    }

    /**替换账号组织关系*/
    public async httpBaseAccountUpdateUserOrganization(
        principal: AuthPrincipal,
        input: UserDto.ReplaceUserOrganizationsPayloadDto
    ): Promise<SuccessResponseDataDto> {
        const targetUid = assertUid(input.uid, '账号UID')
        await this.userUtilsService.findCanAccessUser(principal.uid, targetUid)
        this.userUtilsService.findMembershipsRequired(input.memberships)
        await this.userRepository.manager.transaction(async manager => {
            await this.userUtilsService.lockUser(manager, targetUid)
            const organizationKeyIds = input.memberships.map(item => item.organizationKeyId)
            await this.userUtilsService.findCanAssignOrganizations(principal.uid, organizationKeyIds)
            await this.userUtilsService.findOrganizationsRequired(manager, organizationKeyIds)
            await manager.delete(TbAccountUserOrganization, { userUid: targetUid })
            await this.userUtilsService.insertMemberships(manager, targetUid, input.memberships)
        })
        return { success: true }
    }

    /**替换账号角色关系*/
    public async httpBaseAccountUpdateUserRole(
        principal: AuthPrincipal,
        input: UserDto.ReplaceUserRolesPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.userUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以分配用户角色')
        const targetUid = assertUid(input.uid, '账号UID')
        await this.userUtilsService.findCanAccessUser(principal.uid, targetUid)
        await this.userRepository.manager.transaction(async manager => {
            await this.userUtilsService.lockUser(manager, targetUid)
            await this.userUtilsService.findLastSuperAdminRemovalAvailable(manager, targetUid, input.roleKeyIds)
            await this.userUtilsService.findRolesRequired(manager, input.roleKeyIds)
            await manager.delete(TbAccountUserRole, { userUid: targetUid })
            await this.userUtilsService.insertRoles(manager, targetUid, input.roleKeyIds)
        })
        return { success: true }
    }
}
