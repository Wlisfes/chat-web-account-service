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
    TbAccountUserRole,
    TbAccountPosition,
    TbAccountUserPosition
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { assertUid } from '@wlisfes/chat-web-base-schema/utils'
import { isEmpty, isNotEmpty } from 'class-validator'
import { Brackets, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm'
import { UserDetailResponseDto, UserOrganizationResponseDto } from '@/dto/api-response.dto'
import { PermissionService } from '@/modules/permission/permission.service'
import { UserOrganizationMembershipDto } from '@/modules/user/dto/user.dto'

const USER_RESOURCE_CODE = 'account:user'

@Injectable()
export class UserUtilsService {
    constructor(
        @InjectRepository(TbAccountUser) private readonly userRepository: Repository<TbAccountUser>,
        @InjectRepository(TbAccountPosition) private readonly positionRepository: Repository<TbAccountPosition>,
        @InjectRepository(TbAccountUserPosition) private readonly userPositionRepository: Repository<TbAccountUserPosition>,
        private readonly database: DataBaseService,
        private readonly permissionService: PermissionService
    ) {}

    /**将账号数据范围应用到查询构造器*/
    public async applyDataScope(builder: SelectQueryBuilder<TbAccountUser>, actorUid: string): Promise<void> {
        const scope = await this.permissionService.resolveDataScope(assertUid(actorUid, '当前账号UID'), USER_RESOURCE_CODE)
        if (scope.all) {
            return
        }
        if (!scope.includeSelf && scope.organizationKeyIds.length === 0) {
            builder.andWhere('1 = 0')
            return
        }
        builder.andWhere(
            new Brackets(where => {
                if (scope.includeSelf) {
                    where.orWhere('t.uid = :scopeActorUid', { scopeActorUid: actorUid })
                }
                if (scope.organizationKeyIds.length > 0) {
                    where.orWhere(
                        `EXISTS (
                            SELECT 1
                            FROM tb_account_user_organization scope_user_org
                            WHERE scope_user_org.user_uid = t.uid
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

    /**校验操作者可以访问目标账号*/
    public async findCanAccessUser(actorUid: string, targetUid: string): Promise<void> {
        const exists = await this.database.builder(this.userRepository, async qb => {
            qb.where('t.uid = :targetUid', { targetUid })
            await this.applyDataScope(qb, actorUid)
            return qb.getExists()
        })
        if (!exists) {
            throw new ForbiddenException('无权访问目标账号的数据')
        }
    }

    /**获取账号完整详情*/
    public async findDetail(actorUid: string, targetUid: string): Promise<UserDetailResponseDto> {
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        await this.findCanAccessUser(actorUid, normalizedTargetUid)
        const user = await this.database.builder(this.userRepository, qb => qb.where('t.uid = :uid', { uid: normalizedTargetUid }).getOne())
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        const [memberships, roleRelations, positionRelations] = await Promise.all([
            this.userRepository.manager.find(TbAccountUserOrganization, { where: { userUid: normalizedTargetUid } }),
            this.userRepository.manager.find(TbAccountUserRole, { where: { userUid: normalizedTargetUid } }),
            this.userPositionRepository.find({ where: { userUid: normalizedTargetUid } })
        ])
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        const roleKeyIds = roleRelations.map(item => item.roleKeyId)
        const positionKeyIds = positionRelations.map(item => item.positionKeyId)
        const [organizations, roles, positions] = await Promise.all([
            organizationKeyIds.length > 0
                ? this.userRepository.manager.find(TbAccountOrganization, { where: { keyId: In(organizationKeyIds) } })
                : [],
            roleKeyIds.length > 0 ? this.userRepository.manager.find(TbAccountRole, { where: { keyId: In(roleKeyIds) } }) : [],
            positionKeyIds.length > 0 ? this.positionRepository.find({ where: { keyId: In(positionKeyIds) } }) : []
        ])
        const membershipByOrganization = new Map(memberships.map(item => [item.organizationKeyId, item]))
        return {
            ...user,
            memberships,
            organizations: organizations.map(organization => ({
                ...organization,
                isPrimary: membershipByOrganization.get(organization.keyId)?.isPrimary ?? false,
                positionName: membershipByOrganization.get(organization.keyId)?.positionName,
                membershipStatus: membershipByOrganization.get(organization.keyId)?.status ?? TbAccountUserOrganizationStatus.DISABLED
            })),
            roleKeyIds,
            roles,
            positionKeyIds,
            positions
        }
    }

    /**校验账号组织关系规则*/
    public findMembershipsRequired(memberships: UserOrganizationMembershipDto[]): void {
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
            throw new BadRequestException('同一个组织不能重复关联')
        }
        const primaryCount = memberships.filter(item => item.isPrimary).length
        if (memberships.length > 0 && primaryCount !== 1) {
            throw new BadRequestException('存在组织关系时必须且只能设置一个主组织')
        }
        if (memberships.some(item => item.isPrimary && item.status !== TbAccountUserOrganizationStatus.ENABLED)) {
            throw new BadRequestException('主组织关系必须启用')
        }
    }

    /**锁定并获取目标账号*/
    public async lockUser(manager: EntityManager, userUid: string): Promise<TbAccountUser> {
        const user = await manager.findOne(TbAccountUser, { where: { uid: userUid }, lock: { mode: 'pessimistic_write' } })
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        return user
    }

    /**校验组织列表存在且已启用*/
    public async findOrganizationsRequired(manager: EntityManager, organizationKeyIds: number[]): Promise<void> {
        if (organizationKeyIds.length === 0) {
            return
        }
        const organizations = await manager.find(TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: TbAccountOrganizationStatus.ENABLED }
        })
        if (organizations.length !== organizationKeyIds.length) {
            throw new BadRequestException('组织关系列表包含不存在或已禁用的组织')
        }
    }

    /**校验角色列表存在且已启用*/
    public async findRolesRequired(manager: EntityManager, roleKeyIds: number[]): Promise<void> {
        if (roleKeyIds.length === 0) {
            return
        }
        const roles = await manager.find(TbAccountRole, {
            where: { keyId: In(roleKeyIds), status: TbAccountRoleStatus.ENABLED }
        })
        if (roles.length !== roleKeyIds.length) {
            throw new BadRequestException('角色列表包含不存在或已禁用的角色')
        }
    }

    /**校验职位列表存在。*/
    public async findPositionsRequired(manager: EntityManager, positionKeyIds: number[]): Promise<void> {
        if (positionKeyIds.length === 0) return
        const positions = await manager.find(TbAccountPosition, { where: { keyId: In(positionKeyIds) } })
        if (positions.length !== positionKeyIds.length) throw new BadRequestException('职位列表包含不存在的职位')
    }

    /**批量写入账号组织关系*/
    public async insertMemberships(manager: EntityManager, userUid: string, memberships: UserOrganizationMembershipDto[]): Promise<void> {
        if (memberships.length === 0) {
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

    /**批量写入账号角色关系*/
    public async insertRoles(manager: EntityManager, userUid: string, roleKeyIds: number[]): Promise<void> {
        if (roleKeyIds.length === 0) {
            return
        }
        await manager.insert(
            TbAccountUserRole,
            roleKeyIds.map(roleKeyId => ({ userUid, roleKeyId }))
        )
    }

    /**替换账号职位关系。*/
    public async replacePositions(manager: EntityManager, userUid: string, positionKeyIds: number[]): Promise<void> {
        await manager.delete(TbAccountUserPosition, { userUid })
        if (positionKeyIds.length > 0) {
            await manager.insert(
                TbAccountUserPosition,
                positionKeyIds.map(positionKeyId => ({ userUid, positionKeyId }))
            )
        }
    }

    /**批量补充账号组织和角色信息*/
    public async enrichUsers(users: TbAccountUser[]): Promise<UserDetailResponseDto[]> {
        const userUids = users.map(user => user.uid)
        if (userUids.length === 0) {
            return []
        }
        const [memberships, roleRelations, positionRelations] = await Promise.all([
            this.userRepository.manager.find(TbAccountUserOrganization, { where: { userUid: In(userUids) } }),
            this.userRepository.manager.find(TbAccountUserRole, { where: { userUid: In(userUids) } }),
            this.userPositionRepository.find({ where: { userUid: In(userUids) } })
        ])
        const organizationKeyIds = [...new Set(memberships.map(item => item.organizationKeyId))]
        const roleKeyIds = [...new Set(roleRelations.map(item => item.roleKeyId))]
        const positionKeyIds = [...new Set(positionRelations.map(item => item.positionKeyId))]
        const organizationsPromise: Promise<TbAccountOrganization[]> =
            organizationKeyIds.length > 0
                ? this.userRepository.manager.find(TbAccountOrganization, { where: { keyId: In(organizationKeyIds) } })
                : Promise.resolve([])
        const rolesPromise: Promise<TbAccountRole[]> =
            roleKeyIds.length > 0
                ? this.userRepository.manager.find(TbAccountRole, { where: { keyId: In(roleKeyIds) } })
                : Promise.resolve([])
        const positionsPromise: Promise<TbAccountPosition[]> =
            positionKeyIds.length > 0 ? this.positionRepository.find({ where: { keyId: In(positionKeyIds) } }) : Promise.resolve([])
        const [organizations, roles, positions] = await Promise.all([organizationsPromise, rolesPromise, positionsPromise])
        const organizationByKeyId = new Map<number, TbAccountOrganization>(organizations.map(item => [item.keyId, item]))
        const roleByKeyId = new Map<number, TbAccountRole>(roles.map(item => [item.keyId, item]))
        const positionByKeyId = new Map<number, TbAccountPosition>(positions.map(item => [item.keyId, item]))
        return users.map(user => {
            const userMemberships = memberships.filter(item => item.userUid === user.uid)
            const userRoleRelations = roleRelations.filter(item => item.userUid === user.uid)
            const userPositionRelations = positionRelations.filter(item => item.userUid === user.uid)
            const userOrganizations: UserOrganizationResponseDto[] = []
            for (const membership of userMemberships) {
                const organization = organizationByKeyId.get(membership.organizationKeyId)
                if (!organization) continue
                userOrganizations.push({
                    ...organization,
                    isPrimary: membership.isPrimary,
                    positionName: membership.positionName,
                    membershipStatus: membership.status
                })
            }
            const userRoles: TbAccountRole[] = []
            for (const relation of userRoleRelations) {
                const role = roleByKeyId.get(relation.roleKeyId)
                if (role) userRoles.push(role)
            }
            return {
                ...user,
                memberships: userMemberships,
                organizations: userOrganizations,
                roleKeyIds: userRoleRelations.map(item => item.roleKeyId),
                roles: userRoles,
                positionKeyIds: userPositionRelations.map(item => item.positionKeyId),
                positions: userPositionRelations.flatMap(item => {
                    const position = positionByKeyId.get(item.positionKeyId)
                    return position ? [{ keyId: position.keyId, name: position.name }] : []
                })
            }
        })
    }

    /**校验组织列表位于操作者数据范围内*/
    public async findCanAssignOrganizations(actorUid: string, organizationKeyIds: number[]): Promise<void> {
        const scope = await this.permissionService.resolveDataScope(assertUid(actorUid, '当前账号UID'), USER_RESOURCE_CODE)
        if (scope.all) {
            return
        }
        if (organizationKeyIds.length === 0 || organizationKeyIds.some(keyId => !scope.organizationKeyIds.includes(keyId))) {
            throw new ForbiddenException('不能把账号分配到当前用户数据范围之外的组织')
        }
    }

    /**校验操作者为超级管理员*/
    public async findSuperAdminRequired(actorUid: string, message: string): Promise<void> {
        if (!(await this.permissionService.isSuperAdmin(actorUid))) {
            throw new ForbiddenException(message)
        }
    }

    /**校验不能移除系统中最后一个超级管理员*/
    public async findLastSuperAdminRemovalAvailable(manager: EntityManager, targetUid: string, roleKeyIds: number[]): Promise<void> {
        const superAdminRole = await manager.findOneBy(TbAccountRole, { code: 'super_admin' })
        if (!superAdminRole || roleKeyIds.includes(superAdminRole.keyId)) {
            return
        }
        const assignments = await this.database.builder(manager.getRepository(TbAccountUserRole), qb =>
            qb.where('t.roleKeyId = :roleKeyId', { roleKeyId: superAdminRole.keyId }).setLock('pessimistic_write').getMany()
        )
        if (assignments.some(item => item.userUid === targetUid) && assignments.length <= 1) {
            throw new BadRequestException('不能移除系统中最后一个超级管理员')
        }
    }

    /**校验账号工号、手机号和邮箱唯一*/
    public async findUserUnique(
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
            if (isEmpty(value)) {
                continue
            }
            const exists = await this.database.builder(manager.getRepository(TbAccountUser), qb => {
                qb.where(`t.${field} = :value`, { value: value ?? '' })
                if (isNotEmpty(excludedUid)) {
                    qb.andWhere('t.uid <> :excludedUid', { excludedUid })
                }
                return qb.getExists()
            })
            if (exists) {
                throw new ConflictException(`${label}已存在`)
            }
        }
    }

    /**转义 LIKE 查询特殊字符*/
    public escapeLike(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    }
}
