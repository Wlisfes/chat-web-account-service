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
        const organizations = await this.database.builder(this.organizationRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        const memberships = await this.organizationRepository.manager.find(Schema.TbAccountUserOrganization, {
            where: { status: Schema.TbAccountUserOrganizationStatus.ENABLED }
        })
        const leaderUids = [...new Set(organizations.map(item => item.leaderUserUid).filter((value): value is string => isNotEmpty(value)))]
        const leaders =
            leaderUids.length > 0
                ? await this.organizationRepository.manager.find(Schema.TbAccountUser, { where: { uid: In(leaderUids) } })
                : []
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
        const { entities, raw } = await this.database.builder(this.organizationRepository, qb =>
            qb
                .leftJoin(
                    Schema.TbAccountUserOrganization,
                    'membership',
                    'membership.organizationKeyId = t.keyId AND membership.status = :membershipStatus',
                    { membershipStatus: Schema.TbAccountUserOrganizationStatus.ENABLED }
                )
                .leftJoin(Schema.TbAccountUser, 'member', 'member.uid = membership.userUid')
                .leftJoin(Schema.TbAccountUser, 'leader', 'leader.uid = t.leaderUserUid')
                .orderBy('t.sort', 'ASC')
                .addOrderBy('t.keyId', 'ASC')
                .select('t')
                .addSelect('membership.isPrimary', 'isPrimary')
                .addSelect('membership.positionName', 'positionName')
                .addSelect('member.uid', 'memberUid')
                .addSelect('member.number', 'memberNumber')
                .addSelect('member.name', 'memberName')
                .addSelect('member.avatar', 'memberAvatar')
                .addSelect('leader.uid', 'leaderUid')
                .addSelect('leader.number', 'leaderNumber')
                .addSelect('leader.name', 'leaderName')
                .addSelect('leader.avatar', 'leaderAvatar')
                .getRawAndEntities()
        )
        const nodes = new Map<number, OrganizationDto.OrganizationUserNodeResponseDto>()
        const leaders = new Map<number, Pick<OrganizationDto.OrganizationUserResponseDto, 'uid' | 'number' | 'name' | 'avatar'>>()
        entities.forEach((organization, index) => {
            const row = raw[index] ?? {}
            let node = nodes.get(organization.keyId)
            if (!node) {
                node = {
                    keyId: organization.keyId,
                    parentKeyId: organization.parentKeyId,
                    name: organization.name,
                    type: organization.type,
                    leaderUserUid: organization.leaderUserUid,
                    sort: organization.sort,
                    memberCount: 0,
                    members: [],
                    children: []
                }
                nodes.set(organization.keyId, node)
                if (isNotEmpty(row.leaderUid)) {
                    leaders.set(organization.keyId, {
                        uid: row.leaderUid,
                        number: row.leaderNumber,
                        name: row.leaderName,
                        avatar: row.leaderAvatar
                    })
                }
            }
            if (!isNotEmpty(row.memberUid)) return
            node.members.push({
                uid: row.memberUid,
                number: row.memberNumber,
                name: row.memberName,
                avatar: row.memberAvatar,
                isPrimary: Boolean(row.isPrimary),
                positionName: row.positionName,
                organizationKeyId: organization.keyId
            })
            node.memberCount = node.members.length
        })
        for (const node of nodes.values()) {
            const leader = leaders.get(node.keyId)
            if (leader && !node.members.some(item => item.uid === leader.uid)) {
                node.members.push({
                    uid: leader.uid,
                    number: leader.number,
                    name: leader.name,
                    avatar: leader.avatar,
                    isPrimary: false,
                    organizationKeyId: node.keyId
                })
            }
            node.memberCount = node.members.length
        }
        return this.aggregateSubtreeMemberCount(buildTree([...nodes.values()]) as OrganizationDto.OrganizationUserNodeResponseDto[])
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
