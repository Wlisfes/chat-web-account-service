import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DataBaseService, EntityManager, In, InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, assertValidTree, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import * as OrganizationDto from '@/modules/organization/dto/organization.dto'

@Injectable()
export class OrganizationUtilsService {
    constructor(
        @InjectRepository(Schema.TbAccountOrganization) private readonly organizationRepository: Repository<Schema.TbAccountOrganization>,
        private readonly database: DataBaseService
    ) {}

    /**按子树去重累计启用成员数量，上级包含下级*/
    private aggregateSubtreeMemberCount<T extends { keyId: number; memberCount: number; members?: Array<{ uid: string }>; children?: T[] }>(
        nodes: T[],
        directUids?: Map<number, Set<string>>
    ): T[] {
        const walk = (node: T): Set<string> => {
            const uids = new Set<string>(directUids?.get(node.keyId) ?? (node.members ?? []).map(item => item.uid))
            for (const child of node.children ?? []) {
                for (const uid of walk(child)) uids.add(uid)
            }
            node.memberCount = uids.size
            return uids
        }
        nodes.forEach(walk)
        return nodes
    }

    /**查询并组装完整组织树*/
    public async findTree(): Promise<OrganizationDto.OrganizationTreeNodeResponseDto[]> {
        return this.organizationRepository.manager.transaction(manager => this.findTreeWithManager(manager))
    }

    /**在事务内查询并组装完整组织树*/
    private async findTreeWithManager(manager: EntityManager): Promise<OrganizationDto.OrganizationTreeNodeResponseDto[]> {
        const repository = manager.getRepository(Schema.TbAccountOrganization)
        const organizations = await this.database.builder(repository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        const memberships = await manager.find(Schema.TbAccountUserOrganization, {
            where: { status: Schema.TbAccountUserOrganizationStatus.ENABLED }
        })
        const leaderUids = [...new Set(organizations.map(item => item.leaderUserUid).filter((value): value is string => isNotEmpty(value)))]
        const leaders = leaderUids.length > 0 ? await manager.find(Schema.TbAccountUser, { where: { uid: In(leaderUids) } }) : []
        const leaderByUid = new Map(leaders.map(item => [item.uid, item]))
        const memberUids = memberships.reduce((uids, item) => {
            const organizationUids = uids.get(item.organizationKeyId) ?? new Set<string>()
            organizationUids.add(item.userUid)
            uids.set(item.organizationKeyId, organizationUids)
            return uids
        }, new Map<number, Set<string>>())
        for (const organization of organizations) {
            if (!isNotEmpty(organization.leaderUserUid)) continue
            const organizationUids = memberUids.get(organization.keyId) ?? new Set<string>()
            organizationUids.add(organization.leaderUserUid)
            memberUids.set(organization.keyId, organizationUids)
        }
        return this.aggregateSubtreeMemberCount(
            buildTree(
                organizations.map(organization => ({
                    ...organization,
                    memberCount: memberUids.get(organization.keyId)?.size ?? 0,
                    leader: isNotEmpty(organization.leaderUserUid) ? (leaderByUid.get(organization.leaderUserUid) ?? null) : null
                }))
            ) as OrganizationDto.OrganizationTreeNodeResponseDto[],
            memberUids
        )
    }

    /**查询并组装带启用成员的完整组织树*/
    public async findOrganizationUser(): Promise<OrganizationDto.OrganizationUserNodeResponseDto[]> {
        return this.organizationRepository.manager.transaction(manager => this.findOrganizationUserWithManager(manager))
    }

    /**在事务内查询并组装带启用成员的组织树*/
    private async findOrganizationUserWithManager(manager: EntityManager): Promise<OrganizationDto.OrganizationUserNodeResponseDto[]> {
        const repository = manager.getRepository(Schema.TbAccountOrganization)
        const organizations = await this.findOrganizationUserOrganizations(repository)
        const memberships = await this.findOrganizationUserMemberships(manager)
        const userByUid = await this.findOrganizationUserByUid(manager, organizations, memberships)
        const membershipsByOrganization = this.groupOrganizationUserMemberships(memberships)
        const nodes = organizations.map(organization =>
            this.createOrganizationUserNode(organization, membershipsByOrganization.get(organization.keyId) ?? [], userByUid)
        )
        return this.aggregateSubtreeMemberCount(buildTree(nodes) as OrganizationDto.OrganizationUserNodeResponseDto[])
    }

    /**查询带成员组织树的全部组织*/
    private async findOrganizationUserOrganizations(
        repository: Repository<Schema.TbAccountOrganization>
    ): Promise<Schema.TbAccountOrganization[]> {
        return this.database.builder(repository, qb => qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany())
    }

    /**查询全部启用的用户组织关系*/
    private async findOrganizationUserMemberships(manager: EntityManager): Promise<Schema.TbAccountUserOrganization[]> {
        return manager.find(Schema.TbAccountUserOrganization, {
            where: { status: Schema.TbAccountUserOrganizationStatus.ENABLED }
        })
    }

    /**查询成员和负责人摘要，并按 UID 建立索引*/
    private async findOrganizationUserByUid(
        manager: EntityManager,
        organizations: Schema.TbAccountOrganization[],
        memberships: Schema.TbAccountUserOrganization[]
    ): Promise<Map<string, Schema.TbAccountUser>> {
        const userUids = new Set<string>()
        for (const membership of memberships) {
            userUids.add(membership.userUid)
        }
        for (const organization of organizations) {
            if (isNotEmpty(organization.leaderUserUid)) {
                userUids.add(organization.leaderUserUid)
            }
        }
        if (userUids.size === 0) {
            return new Map()
        }
        const users = await manager.find(Schema.TbAccountUser, {
            where: { uid: In([...userUids]) }
        })
        return new Map(users.map(item => [item.uid, item]))
    }

    /**按组织分组用户组织关系*/
    private groupOrganizationUserMemberships(
        memberships: Schema.TbAccountUserOrganization[]
    ): Map<number, Schema.TbAccountUserOrganization[]> {
        const membershipsByOrganization = new Map<number, Schema.TbAccountUserOrganization[]>()
        for (const membership of memberships) {
            const organizationMemberships = membershipsByOrganization.get(membership.organizationKeyId) ?? []
            organizationMemberships.push(membership)
            membershipsByOrganization.set(membership.organizationKeyId, organizationMemberships)
        }
        return membershipsByOrganization
    }

    /**组装单个组织节点及直接成员*/
    private createOrganizationUserNode(
        organization: Schema.TbAccountOrganization,
        memberships: Schema.TbAccountUserOrganization[],
        userByUid: Map<string, Schema.TbAccountUser>
    ): OrganizationDto.OrganizationUserNodeResponseDto {
        const members: OrganizationDto.OrganizationUserResponseDto[] = []
        for (const membership of memberships) {
            const user = userByUid.get(membership.userUid)
            if (user) {
                members.push(this.createOrganizationUserMember(user, organization.keyId, membership))
            }
        }
        this.appendOrganizationUserLeader(members, organization, userByUid)
        return {
            keyId: organization.keyId,
            parentKeyId: organization.parentKeyId,
            name: organization.name,
            type: organization.type,
            leaderUserUid: organization.leaderUserUid,
            sort: organization.sort,
            memberCount: members.length,
            members,
            children: []
        }
    }

    /**负责人不是正式成员时补充到成员列表*/
    private appendOrganizationUserLeader(
        members: OrganizationDto.OrganizationUserResponseDto[],
        organization: Schema.TbAccountOrganization,
        userByUid: Map<string, Schema.TbAccountUser>
    ): void {
        const isLeaderMissing = isNotEmpty(organization.leaderUserUid) && !members.some(item => item.uid === organization.leaderUserUid)
        if (!isLeaderMissing) return
        const leader = userByUid.get(organization.leaderUserUid)
        if (leader) {
            members.push(this.createOrganizationUserMember(leader, organization.keyId))
        }
    }

    /**创建组织成员响应数据*/
    private createOrganizationUserMember(
        user: Schema.TbAccountUser,
        organizationKeyId: number,
        membership?: Schema.TbAccountUserOrganization
    ): OrganizationDto.OrganizationUserResponseDto {
        return {
            uid: user.uid,
            number: user.number,
            name: user.name,
            avatar: user.avatar,
            isPrimary: Boolean(membership?.isPrimary),
            positionName: membership?.positionName,
            organizationKeyId
        }
    }

    /**获取必需的组织详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbAccountOrganization> {
        const organization = isNotEmpty(manager)
            ? await manager.findOneBy(Schema.TbAccountOrganization, { keyId })
            : await this.database.builder(this.organizationRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        if (!organization) {
            throw new NotFoundException('组织不存在')
        }
        return organization
    }

    /**锁定组织树*/
    public async lockTree(manager: EntityManager): Promise<void> {
        await this.database.builder(manager.getRepository(Schema.TbAccountOrganization), qb => qb.setLock('pessimistic_write').getMany())
    }

    /**校验父组织和负责人引用*/
    public async findReferencesRequired(manager: EntityManager, parentKeyId?: number | null, leaderUserUid?: string): Promise<void> {
        if (isNotEmpty(parentKeyId)) {
            const parent = await manager.findOneBy(Schema.TbAccountOrganization, { keyId: parentKeyId })
            if (!parent) {
                throw new BadRequestException('父组织不存在')
            }
            if (parent.status !== Schema.TbAccountOrganizationStatus.ENABLED) {
                throw new BadRequestException('父组织已禁用')
            }
        }
        if (isNotEmpty(leaderUserUid)) {
            assertUid(leaderUserUid, '负责人账号UID')
            if (!(await manager.existsBy(Schema.TbAccountUser, { uid: leaderUserUid }))) {
                throw new BadRequestException('负责人账号不存在')
            }
        }
    }

    /**确保负责人已绑定为当前组织启用成员*/
    public async ensureLeaderMembership(manager: EntityManager, organizationKeyId: number, leaderUserUid?: string): Promise<void> {
        if (!isNotEmpty(leaderUserUid)) {
            return
        }
        const memberships = await manager.find(Schema.TbAccountUserOrganization, { where: { userUid: leaderUserUid } })
        const existing = memberships.find(item => item.organizationKeyId === organizationKeyId)
        if (existing) {
            if (existing.status !== Schema.TbAccountUserOrganizationStatus.ENABLED) {
                existing.status = Schema.TbAccountUserOrganizationStatus.ENABLED
                await manager.save(existing)
            }
            return
        }
        await manager.insert(Schema.TbAccountUserOrganization, {
            userUid: leaderUserUid,
            organizationKeyId,
            isPrimary: !memberships.some(item => item.isPrimary),
            status: Schema.TbAccountUserOrganizationStatus.ENABLED
        })
    }

    /**校验组织编码可用*/
    public async findCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const exists = await this.database.builder(manager.getRepository(Schema.TbAccountOrganization), qb => {
            qb.where('t.code = :code', { code: code.trim() })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('组织编码已存在')
        }
    }

    /**校验组织节点允许删除*/
    public async findDeleteAvailable(manager: EntityManager, keyId: number): Promise<void> {
        if (await manager.existsBy(Schema.TbAccountOrganization, { parentKeyId: keyId })) {
            throw new ConflictException('组织存在下级节点，不能删除')
        }
        if (await manager.existsBy(Schema.TbAccountUserOrganization, { organizationKeyId: keyId })) {
            throw new ConflictException('组织仍有关联成员，不能删除')
        }
    }

    /**删除组织及数据范围引用*/
    public async removeOrganization(manager: EntityManager, keyId: number): Promise<void> {
        await manager.delete(Schema.TbAccountRoleDataScopeOrganization, { organizationKeyId: keyId })
        await manager.delete(Schema.TbAccountOrganization, { keyId })
    }

    /**删除空部门对应的非内置部门角色*/
    public async removeDepartmentRoles(manager: EntityManager, organizationKeyId: number): Promise<void> {
        const linkedOrganizations = await manager.find(Schema.TbAccountRoleDataScopeOrganization, {
            where: { organizationKeyId },
            select: { dataScopeKeyId: true }
        })
        const linkedDataScopeKeyIds = [...new Set(linkedOrganizations.map(item => item.dataScopeKeyId))]
        if (linkedDataScopeKeyIds.length === 0) return

        const linkedDataScopes = await manager.find(Schema.TbAccountRoleDataScope, {
            where: { keyId: In(linkedDataScopeKeyIds) },
            select: { roleKeyId: true }
        })
        const linkedRoleKeyIds = [...new Set(linkedDataScopes.map(item => item.roleKeyId))]
        if (linkedRoleKeyIds.length === 0) return

        const linkedRoles = await manager.find(Schema.TbAccountRole, {
            where: { keyId: In(linkedRoleKeyIds), builtin: false },
            select: { keyId: true }
        })
        const candidateRoleKeyIds = linkedRoles.map(role => role.keyId)
        if (candidateRoleKeyIds.length === 0) return

        const candidateDataScopes = await manager.find(Schema.TbAccountRoleDataScope, {
            where: { roleKeyId: In(candidateRoleKeyIds) },
            select: { keyId: true, roleKeyId: true }
        })
        const roleKeyIdByScope = new Map(candidateDataScopes.map(scope => [scope.keyId, scope.roleKeyId]))
        const candidateScopeKeyIds = [...roleKeyIdByScope.keys()]
        const candidateOrganizations =
            candidateScopeKeyIds.length > 0
                ? await manager.find(Schema.TbAccountRoleDataScopeOrganization, {
                      where: { dataScopeKeyId: In(candidateScopeKeyIds) },
                      select: { dataScopeKeyId: true, organizationKeyId: true }
                  })
                : []
        const organizationKeyIdsByRole = new Map<number, Set<number>>()
        for (const item of candidateOrganizations) {
            const roleKeyId = roleKeyIdByScope.get(item.dataScopeKeyId)
            if (!roleKeyId) continue
            const organizationKeyIds = organizationKeyIdsByRole.get(roleKeyId) ?? new Set<number>()
            organizationKeyIds.add(item.organizationKeyId)
            organizationKeyIdsByRole.set(roleKeyId, organizationKeyIds)
        }
        const departmentRoleKeyIds = candidateRoleKeyIds.filter(roleKeyId => {
            const organizationKeyIds = organizationKeyIdsByRole.get(roleKeyId)
            return organizationKeyIds?.size === 1 && organizationKeyIds.has(organizationKeyId)
        })
        if (departmentRoleKeyIds.length === 0) return

        const departmentScopeKeyIds = candidateDataScopes
            .filter(scope => departmentRoleKeyIds.includes(scope.roleKeyId))
            .map(scope => scope.keyId)
        await manager.delete(Schema.TbAccountUserRole, { roleKeyId: In(departmentRoleKeyIds) })
        await manager.delete(Schema.TbAccountRoleMenu, { roleKeyId: In(departmentRoleKeyIds) })
        if (departmentScopeKeyIds.length > 0) {
            await manager.delete(Schema.TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(departmentScopeKeyIds) })
        }
        await manager.delete(Schema.TbAccountRoleDataScope, { roleKeyId: In(departmentRoleKeyIds) })
        await manager.delete(Schema.TbAccountRole, { keyId: In(departmentRoleKeyIds) })
    }

    /**校验组织树并重建闭包表*/
    public async rebuildClosure(manager: EntityManager): Promise<void> {
        const organizations = await manager.find(Schema.TbAccountOrganization, { order: { keyId: 'ASC' } })
        try {
            assertValidTree(organizations, '组织架构')
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }

        const byKeyId = new Map(organizations.map(organization => [organization.keyId, organization]))
        const rows: Array<Pick<Schema.TbAccountOrganizationClosure, 'ancestorKeyId' | 'descendantKeyId' | 'depth'>> = []
        for (const organization of organizations) {
            rows.push({ ancestorKeyId: organization.keyId, descendantKeyId: organization.keyId, depth: 0 })
            let depth = 1
            let parentKeyId = organization.parentKeyId
            while (isNotEmpty(parentKeyId)) {
                rows.push({ ancestorKeyId: parentKeyId, descendantKeyId: organization.keyId, depth })
                parentKeyId = byKeyId.get(parentKeyId)?.parentKeyId
                depth += 1
            }
        }

        await manager.createQueryBuilder().delete().from(Schema.TbAccountOrganizationClosure).execute()
        for (let offset = 0; offset < rows.length; offset += 500) {
            await manager.insert(Schema.TbAccountOrganizationClosure, rows.slice(offset, offset + 500))
        }
    }
}
