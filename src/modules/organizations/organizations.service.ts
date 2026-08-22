import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountOrganizationStatus,
    TbAccountRoleDataScopeOrganization,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { EntityManager, In, Repository } from 'typeorm'
import { assertUid, assertValidTree, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { CreateOrganizationDto, UpdateOrganizationDto } from '@/modules/organizations/dto/organization.dto'

@Injectable()
export class OrganizationsService {
    constructor(@InjectRepository(TbAccountOrganization) private readonly organizationRepository: Repository<TbAccountOrganization>) {}

    async getTree() {
        const organizations = await this.organizationRepository.find({ order: { sort: 'ASC', keyId: 'ASC' } })
        const memberships = await this.organizationRepository.manager.find(TbAccountUserOrganization, {
            where: { status: TbAccountUserOrganizationStatus.ENABLED }
        })
        const leaderUids = [...new Set(organizations.map(item => item.leaderUserUid).filter(Boolean))]
        const leaders = leaderUids.length
            ? await this.organizationRepository.manager.find(TbAccountUser, { where: { uid: In(leaderUids) } })
            : []
        const leaderByUid = new Map(leaders.map(item => [item.uid, item]))
        const memberCounts = memberships.reduce((counts, item) => {
            counts.set(item.organizationKeyId, (counts.get(item.organizationKeyId) ?? 0) + 1)
            return counts
        }, new Map<number, number>())
        return buildTree(
            organizations.map(organization => ({
                ...organization,
                memberCount: memberCounts.get(organization.keyId) ?? 0,
                leader: organization.leaderUserUid ? leaderByUid.get(organization.leaderUserUid) ?? null : null
            }))
        )
    }

    async findOne(keyId: number): Promise<TbAccountOrganization> {
        const organization = await this.organizationRepository.findOne({ where: { keyId } })
        if (!organization) {
            throw new NotFoundException('组织不存在')
        }
        return organization
    }

    async create(input: CreateOrganizationDto): Promise<TbAccountOrganization> {
        return this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const parentKeyId = input.parentKeyId ?? null
            await this.assertReferences(manager, parentKeyId, input.leaderUserUid)
            await this.assertCodeAvailable(manager, input.code)

            const organization = manager.create(TbAccountOrganization, {
                ...input,
                parentKeyId: parentKeyId as unknown as number
            })
            const saved = await manager.save(organization)
            await this.rebuildClosure(manager)
            return saved
        })
    }

    async update(keyId: number, input: UpdateOrganizationDto): Promise<TbAccountOrganization> {
        return this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const organization = await manager.findOneBy(TbAccountOrganization, { keyId })
            if (!organization) {
                throw new NotFoundException('组织不存在')
            }

            const nextParentKeyId = input.parentKeyId === undefined ? organization.parentKeyId : input.parentKeyId ?? null
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('组织不能成为自己的父节点')
            }
            await this.assertReferences(manager, nextParentKeyId, input.leaderUserUid)
            if (input.code && input.code !== organization.code) {
                await this.assertCodeAvailable(manager, input.code, keyId)
            }

            manager.merge(TbAccountOrganization, organization, input, { parentKeyId: nextParentKeyId as unknown as number })
            await manager.save(organization)
            await this.rebuildClosure(manager)
            return organization
        })
    }

    async remove(keyId: number): Promise<void> {
        await this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const organization = await manager.findOneBy(TbAccountOrganization, { keyId })
            if (!organization) {
                throw new NotFoundException('组织不存在')
            }
            if (await manager.existsBy(TbAccountOrganization, { parentKeyId: keyId })) {
                throw new ConflictException('组织存在下级节点，不能删除')
            }
            if (await manager.existsBy(TbAccountUserOrganization, { organizationKeyId: keyId })) {
                throw new ConflictException('组织仍有关联成员，不能删除')
            }
            if (await manager.existsBy(TbAccountRoleDataScopeOrganization, { organizationKeyId: keyId })) {
                throw new ConflictException('组织仍被数据权限引用，不能删除')
            }
            await manager.delete(TbAccountOrganization, { keyId })
            await this.rebuildClosure(manager)
        })
    }

    private async assertReferences(manager: EntityManager, parentKeyId?: number | null, leaderUserUid?: string): Promise<void> {
        if (parentKeyId) {
            const parent = await manager.findOneBy(TbAccountOrganization, { keyId: parentKeyId })
            if (!parent) {
                throw new BadRequestException('父组织不存在')
            }
            if (parent.status !== TbAccountOrganizationStatus.ENABLED) {
                throw new BadRequestException('父组织已禁用')
            }
        }
        if (leaderUserUid) {
            assertUid(leaderUserUid, '负责人账号UID')
            if (!(await manager.existsBy(TbAccountUser, { uid: leaderUserUid }))) {
                throw new BadRequestException('负责人账号不存在')
            }
        }
    }

    private async assertCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const query = manager
            .getRepository(TbAccountOrganization)
            .createQueryBuilder('organization')
            .where('organization.code = :code', { code: code.trim() })
        if (excludedKeyId) {
            query.andWhere('organization.keyId <> :excludedKeyId', { excludedKeyId })
        }
        if (await query.getExists()) {
            throw new ConflictException('组织编码已存在')
        }
    }

    private async rebuildClosure(manager: EntityManager): Promise<void> {
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
            while (parentKeyId) {
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

    private async lockTree(manager: EntityManager): Promise<void> {
        await manager.getRepository(TbAccountOrganization).createQueryBuilder('organization').setLock('pessimistic_write').getMany()
    }
}
