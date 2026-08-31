import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountOrganizationStatus,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, assertValidTree, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { EntityManager, In, Repository } from 'typeorm'
import { OrganizationTreeNodeResponseDto } from '@/dto/api-response.dto'

@Injectable()
export class OrganizationUtilsService {
    constructor(
        @InjectRepository(TbAccountOrganization) private readonly organizationRepository: Repository<TbAccountOrganization>,
        private readonly database: DataBaseService
    ) {}

    /**查询并组装完整组织树*/
    public async findTree(): Promise<OrganizationTreeNodeResponseDto[]> {
        const organizations = await this.database.builder(this.organizationRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        const memberships = await this.organizationRepository.manager.find(TbAccountUserOrganization, {
            where: { status: TbAccountUserOrganizationStatus.ENABLED }
        })
        const leaderUids = [...new Set(organizations.map(item => item.leaderUserUid).filter((value): value is string => isNotEmpty(value)))]
        const leaders =
            leaderUids.length > 0 ? await this.organizationRepository.manager.find(TbAccountUser, { where: { uid: In(leaderUids) } }) : []
        const leaderByUid = new Map(leaders.map(item => [item.uid, item]))
        const memberCounts = memberships.reduce((counts, item) => {
            counts.set(item.organizationKeyId, (counts.get(item.organizationKeyId) ?? 0) + 1)
            return counts
        }, new Map<number, number>())
        return buildTree(
            organizations.map(organization => ({
                ...organization,
                memberCount: memberCounts.get(organization.keyId) ?? 0,
                leader: isNotEmpty(organization.leaderUserUid) ? (leaderByUid.get(organization.leaderUserUid) ?? null) : null
            }))
        ) as OrganizationTreeNodeResponseDto[]
    }

    /**获取必需的组织详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbAccountOrganization> {
        const organization = isNotEmpty(manager)
            ? await manager.findOneBy(TbAccountOrganization, { keyId })
            : await this.database.builder(this.organizationRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        if (!organization) {
            throw new NotFoundException('组织不存在')
        }
        return organization
    }

    /**锁定组织树*/
    public async lockTree(manager: EntityManager): Promise<void> {
        await this.database.builder(manager.getRepository(TbAccountOrganization), qb => qb.setLock('pessimistic_write').getMany())
    }

    /**校验父组织和负责人引用*/
    public async findReferencesRequired(manager: EntityManager, parentKeyId?: number | null, leaderUserUid?: string): Promise<void> {
        if (isNotEmpty(parentKeyId)) {
            const parent = await manager.findOneBy(TbAccountOrganization, { keyId: parentKeyId })
            if (!parent) {
                throw new BadRequestException('父组织不存在')
            }
            if (parent.status !== TbAccountOrganizationStatus.ENABLED) {
                throw new BadRequestException('父组织已禁用')
            }
        }
        if (isNotEmpty(leaderUserUid)) {
            assertUid(leaderUserUid, '负责人账号UID')
            if (!(await manager.existsBy(TbAccountUser, { uid: leaderUserUid }))) {
                throw new BadRequestException('负责人账号不存在')
            }
        }
    }

    /**校验组织编码可用*/
    public async findCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const exists = await this.database.builder(manager.getRepository(TbAccountOrganization), qb => {
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
        if (await manager.existsBy(TbAccountOrganization, { parentKeyId: keyId })) {
            throw new ConflictException('组织存在下级节点，不能删除')
        }
        if (await manager.existsBy(TbAccountUserOrganization, { organizationKeyId: keyId })) {
            throw new ConflictException('组织仍有关联成员，不能删除')
        }
    }

    /**删除组织及数据范围引用*/
    public async removeOrganization(manager: EntityManager, keyId: number): Promise<void> {
        await manager.delete(TbAccountRoleDataScopeOrganization, { organizationKeyId: keyId })
        await manager.delete(TbAccountOrganization, { keyId })
    }

    /**删除空部门对应的非内置部门角色*/
    public async removeDepartmentRoles(manager: EntityManager, organizationKeyId: number): Promise<void> {
        const linkedOrganizations = await manager.find(TbAccountRoleDataScopeOrganization, {
            where: { organizationKeyId },
            select: { dataScopeKeyId: true }
        })
        const linkedDataScopeKeyIds = [...new Set(linkedOrganizations.map(item => item.dataScopeKeyId))]
        if (linkedDataScopeKeyIds.length === 0) return

        const linkedDataScopes = await manager.find(TbAccountRoleDataScope, {
            where: { keyId: In(linkedDataScopeKeyIds) },
            select: { roleKeyId: true }
        })
        const linkedRoleKeyIds = [...new Set(linkedDataScopes.map(item => item.roleKeyId))]
        if (linkedRoleKeyIds.length === 0) return

        const linkedRoles = await manager.find(TbAccountRole, {
            where: { keyId: In(linkedRoleKeyIds), builtin: false },
            select: { keyId: true }
        })
        const candidateRoleKeyIds = linkedRoles.map(role => role.keyId)
        if (candidateRoleKeyIds.length === 0) return

        const candidateDataScopes = await manager.find(TbAccountRoleDataScope, {
            where: { roleKeyId: In(candidateRoleKeyIds) },
            select: { keyId: true, roleKeyId: true }
        })
        const roleKeyIdByScope = new Map(candidateDataScopes.map(scope => [scope.keyId, scope.roleKeyId]))
        const candidateScopeKeyIds = [...roleKeyIdByScope.keys()]
        const candidateOrganizations =
            candidateScopeKeyIds.length > 0
                ? await manager.find(TbAccountRoleDataScopeOrganization, {
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
        await manager.delete(TbAccountUserRole, { roleKeyId: In(departmentRoleKeyIds) })
        await manager.delete(TbAccountRoleMenu, { roleKeyId: In(departmentRoleKeyIds) })
        if (departmentScopeKeyIds.length > 0) {
            await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(departmentScopeKeyIds) })
        }
        await manager.delete(TbAccountRoleDataScope, { roleKeyId: In(departmentRoleKeyIds) })
        await manager.delete(TbAccountRole, { keyId: In(departmentRoleKeyIds) })
    }

    /**校验组织树并重建闭包表*/
    public async rebuildClosure(manager: EntityManager): Promise<void> {
        const organizations = await manager.find(TbAccountOrganization, { order: { keyId: 'ASC' } })
        try {
            assertValidTree(organizations, '组织架构')
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }

        const byKeyId = new Map(organizations.map(organization => [organization.keyId, organization]))
        const rows: Array<Pick<TbAccountOrganizationClosure, 'ancestorKeyId' | 'descendantKeyId' | 'depth'>> = []
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

        await manager.createQueryBuilder().delete().from(TbAccountOrganizationClosure).execute()
        for (let offset = 0; offset < rows.length; offset += 500) {
            await manager.insert(TbAccountOrganizationClosure, rows.slice(offset, offset + 500))
        }
    }
}
