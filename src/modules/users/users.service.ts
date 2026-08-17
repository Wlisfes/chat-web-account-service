import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationStatus,
    TbAccountRole,
    TbAccountRoleStatus,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { Brackets, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm'
import { PageResult } from '@/common/dto/page.dto'
import { assertUid, generateUid } from '@/common/uid'
import { PasswordService } from '@/modules/auth/password.service'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import {
    CreateUserDto,
    ReplaceUserOrganizationsDto,
    ReplaceUserRolesDto,
    ResetUserPasswordDto,
    UpdateUserDto,
    UserOrganizationMembershipDto,
    UserQueryDto
} from '@/modules/users/dto/user.dto'

const USER_RESOURCE_CODE = 'account:user'

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(TbAccountUser) private readonly userRepository: Repository<TbAccountUser>,
        private readonly permissionsService: PermissionsService,
        private readonly passwordService: PasswordService
    ) {}

    async create(actorUid: string, input: CreateUserDto): Promise<TbAccountUser> {
        const memberships = input.memberships ?? []
        const roleKeyIds = input.roleKeyIds ?? []
        this.assertMemberships(memberships)
        await this.assertCanAssignOrganizations(
            actorUid,
            memberships.map(item => item.organizationKeyId)
        )
        if (roleKeyIds.length && !(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ForbiddenException('只有超级管理员可以在创建账号时分配角色')
        }

        return this.userRepository.manager.transaction(async manager => {
            await this.assertUserUnique(manager, input)
            await this.assertOrganizationsExist(
                manager,
                memberships.map(item => item.organizationKeyId)
            )
            await this.assertRolesExist(manager, roleKeyIds)
            const { memberships: _memberships, roleKeyIds: _roleKeyIds, password, ...fields } = input
            const user = manager.create(TbAccountUser, {
                ...fields,
                uid: generateUid(),
                password: await this.passwordService.hash(password)
            })
            const saved = await manager.save(user)
            await this.insertMemberships(manager, saved.uid, memberships)
            await this.insertRoles(manager, saved.uid, roleKeyIds)
            saved.password = undefined as unknown as string
            return saved
        })
    }

    async update(actorUid: string, targetUid: string, input: UpdateUserDto): Promise<TbAccountUser> {
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        await this.assertCanAccessUser(actorUid, normalizedTargetUid)
        return this.userRepository.manager.transaction(async manager => {
            const user = await manager.findOne(TbAccountUser, {
                where: { uid: normalizedTargetUid },
                lock: { mode: 'pessimistic_write' }
            })
            if (!user) {
                throw new NotFoundException('账号不存在')
            }
            await this.assertUserUnique(manager, input, normalizedTargetUid)
            manager.merge(TbAccountUser, user, input)
            return manager.save(user)
        })
    }

    async resetPassword(actorUid: string, targetUid: string, input: ResetUserPasswordDto): Promise<void> {
        if (!(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ForbiddenException('只有超级管理员可以重置其他账号密码')
        }
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        const password = await this.passwordService.hash(input.password)
        await this.userRepository.manager.transaction(async manager => {
            await this.lockUser(manager, normalizedTargetUid)
            await manager.update(TbAccountUser, { uid: normalizedTargetUid }, { password })
        })
    }

    async findPage(actorUid: string, query: UserQueryDto): Promise<PageResult<TbAccountUser>> {
        const builder = this.userRepository.createQueryBuilder('user')
        await this.applyDataScope(builder, actorUid)
        if (query.keyword?.trim()) {
            const keyword = `%${this.escapeLike(query.keyword.trim())}%`
            builder.andWhere(
                new Brackets(where => {
                    where
                        .where("user.number LIKE :keyword ESCAPE '\\\\'", { keyword })
                        .orWhere("user.name LIKE :keyword ESCAPE '\\\\'", { keyword })
                        .orWhere("user.phone LIKE :keyword ESCAPE '\\\\'", { keyword })
                        .orWhere("user.email LIKE :keyword ESCAPE '\\\\'", { keyword })
                })
            )
        }
        if (query.status) {
            builder.andWhere('user.status = :status', { status: query.status })
        }
        builder
            .orderBy('user.keyId', 'DESC')
            .skip((query.page - 1) * query.pageSize)
            .take(query.pageSize)
        const [items, total] = await builder.getManyAndCount()
        return { items, total, page: query.page, pageSize: query.pageSize }
    }

    async findOne(actorUid: string, targetUid: string) {
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        await this.assertCanAccessUser(actorUid, normalizedTargetUid)
        const user = await this.userRepository.findOneBy({ uid: normalizedTargetUid })
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        const [organizations, roleRelations] = await Promise.all([
            this.userRepository.manager.find(TbAccountUserOrganization, { where: { userUid: normalizedTargetUid } }),
            this.userRepository.manager.find(TbAccountUserRole, { where: { userUid: normalizedTargetUid } })
        ])
        return { ...user, organizations, roleKeyIds: roleRelations.map(item => item.roleKeyId) }
    }

    async replaceOrganizations(actorUid: string, targetUid: string, input: ReplaceUserOrganizationsDto): Promise<void> {
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        await this.assertCanAccessUser(actorUid, normalizedTargetUid)
        this.assertMemberships(input.memberships)
        await this.userRepository.manager.transaction(async manager => {
            await this.lockUser(manager, normalizedTargetUid)
            const organizationKeyIds = input.memberships.map(item => item.organizationKeyId)
            await this.assertCanAssignOrganizations(actorUid, organizationKeyIds)
            await this.assertOrganizationsExist(manager, organizationKeyIds)
            await manager.delete(TbAccountUserOrganization, { userUid: normalizedTargetUid })
            await this.insertMemberships(manager, normalizedTargetUid, input.memberships)
        })
    }

    async replaceRoles(actorUid: string, targetUid: string, input: ReplaceUserRolesDto): Promise<void> {
        if (!(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ForbiddenException('只有超级管理员可以分配用户角色')
        }
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        await this.assertCanAccessUser(actorUid, normalizedTargetUid)
        const roleKeyIds = input.roleKeyIds
        await this.userRepository.manager.transaction(async manager => {
            await this.lockUser(manager, normalizedTargetUid)
            const superAdminRole = await manager.findOneBy(TbAccountRole, { code: 'super_admin' })
            if (superAdminRole && !roleKeyIds.includes(superAdminRole.keyId)) {
                const superAdminAssignments = await manager
                    .getRepository(TbAccountUserRole)
                    .createQueryBuilder('user_role')
                    .where('user_role.role_key_id = :roleKeyId', { roleKeyId: superAdminRole.keyId })
                    .setLock('pessimistic_write')
                    .getMany()
                const targetHasSuperAdminRole = superAdminAssignments.some(item => item.userUid === normalizedTargetUid)
                if (targetHasSuperAdminRole) {
                    if (superAdminAssignments.length <= 1) {
                        throw new BadRequestException('不能移除系统中最后一个超级管理员')
                    }
                }
            }
            await this.assertRolesExist(manager, roleKeyIds)
            await manager.delete(TbAccountUserRole, { userUid: normalizedTargetUid })
            await this.insertRoles(manager, normalizedTargetUid, roleKeyIds)
        })
    }

    private async applyDataScope(builder: SelectQueryBuilder<TbAccountUser>, actorUid: string): Promise<void> {
        const scope = await this.permissionsService.resolveDataScope(assertUid(actorUid, '当前账号UID'), USER_RESOURCE_CODE)
        if (scope.all) {
            return
        }
        if (!scope.includeSelf && !scope.organizationKeyIds.length) {
            builder.andWhere('1 = 0')
            return
        }
        builder.andWhere(
            new Brackets(where => {
                if (scope.includeSelf) {
                    where.orWhere('user.uid = :scopeActorUid', { scopeActorUid: actorUid })
                }
                if (scope.organizationKeyIds.length) {
                    where.orWhere(
                        `EXISTS (
                            SELECT 1
                            FROM tb_account_user_organization scope_user_org
                            WHERE scope_user_org.user_uid = user.uid
                              AND scope_user_org.organization_key_id IN (:...scopeOrganizationKeyIds)
                              AND scope_user_org.status = :scopeMembershipStatus
                        )`,
                        {
                            scopeOrganizationKeyIds: scope.organizationKeyIds,
                            scopeMembershipStatus: TbAccountUserOrganizationStatus.ENABLED
                        }
                    )
                }
            })
        )
    }

    private async assertCanAccessUser(actorUid: string, targetUid: string): Promise<void> {
        const builder = this.userRepository.createQueryBuilder('user').where('user.uid = :targetUid', { targetUid })
        await this.applyDataScope(builder, actorUid)
        if (!(await builder.getExists())) {
            throw new ForbiddenException('无权访问目标账号的数据')
        }
    }

    private assertMemberships(memberships: UserOrganizationMembershipDto[]): void {
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
            throw new BadRequestException('同一个组织不能重复关联')
        }
        const primaryCount = memberships.filter(item => item.isPrimary).length
        if (memberships.length && primaryCount !== 1) {
            throw new BadRequestException('存在组织关系时必须且只能设置一个主组织')
        }
        if (memberships.some(item => item.isPrimary && item.status !== TbAccountUserOrganizationStatus.ENABLED)) {
            throw new BadRequestException('主组织关系必须启用')
        }
    }

    private async lockUser(manager: EntityManager, userUid: string): Promise<TbAccountUser> {
        const user = await manager.findOne(TbAccountUser, { where: { uid: userUid }, lock: { mode: 'pessimistic_write' } })
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        return user
    }

    private async assertOrganizationsExist(manager: EntityManager, organizationKeyIds: number[]): Promise<void> {
        if (!organizationKeyIds.length) {
            return
        }
        const organizations = await manager.find(TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: TbAccountOrganizationStatus.ENABLED }
        })
        if (organizations.length !== organizationKeyIds.length) {
            throw new BadRequestException('组织关系列表包含不存在或已禁用的组织')
        }
    }

    private async assertRolesExist(manager: EntityManager, roleKeyIds: number[]): Promise<void> {
        if (!roleKeyIds.length) {
            return
        }
        const roles = await manager.find(TbAccountRole, { where: { keyId: In(roleKeyIds), status: TbAccountRoleStatus.ENABLED } })
        if (roles.length !== roleKeyIds.length) {
            throw new BadRequestException('角色列表包含不存在或已禁用的角色')
        }
    }

    private async insertMemberships(manager: EntityManager, userUid: string, memberships: UserOrganizationMembershipDto[]): Promise<void> {
        if (!memberships.length) {
            return
        }
        await manager.insert(
            TbAccountUserOrganization,
            memberships.map(item => ({
                userUid,
                organizationKeyId: item.organizationKeyId,
                isPrimary: item.isPrimary,
                positionName: item.positionName,
                status: item.status
            }))
        )
    }

    private async insertRoles(manager: EntityManager, userUid: string, roleKeyIds: number[]): Promise<void> {
        if (!roleKeyIds.length) {
            return
        }
        await manager.insert(
            TbAccountUserRole,
            roleKeyIds.map(roleKeyId => ({ userUid, roleKeyId }))
        )
    }

    private async assertCanAssignOrganizations(actorUid: string, organizationKeyIds: number[]): Promise<void> {
        const scope = await this.permissionsService.resolveDataScope(assertUid(actorUid, '当前账号UID'), USER_RESOURCE_CODE)
        if (scope.all) {
            return
        }
        if (!organizationKeyIds.length || organizationKeyIds.some(keyId => !scope.organizationKeyIds.includes(keyId))) {
            throw new ForbiddenException('不能把账号分配到当前用户数据范围之外的组织')
        }
    }

    private async assertUserUnique(
        manager: EntityManager,
        input: Pick<Partial<TbAccountUser>, 'number' | 'phone' | 'email'>,
        excludedUid?: string
    ): Promise<void> {
        const checks = [
            ['number', input.number?.trim(), '工号'],
            ['phone', input.phone?.trim(), '手机号'],
            ['email', input.email?.trim(), '邮箱']
        ] as const
        for (const [field, value, label] of checks) {
            if (!value) {
                continue
            }
            const query = manager.getRepository(TbAccountUser).createQueryBuilder('user').where(`user.${field} = :value`, { value })
            if (excludedUid) {
                query.andWhere('user.uid <> :excludedUid', { excludedUid })
            }
            if (await query.getExists()) {
                throw new ConflictException(`${label}已存在`)
            }
        }
    }

    private escapeLike(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    }
}
