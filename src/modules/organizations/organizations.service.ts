import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountOrganizationStatus,
    TbAccountRoleDataScopeOrganization,
    TbAccountUser,
    TbAccountUserOrganization
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { EntityManager, Repository } from 'typeorm'
import { assertUid, generateUid } from '@/common/uid'
import { assertValidTree, buildTree } from '@/common/tree'
import { CreateOrganizationDto, UpdateOrganizationDto } from '@/modules/organizations/dto/organization.dto'

@Injectable()
export class OrganizationsService {
    constructor(@InjectRepository(TbAccountOrganization) private readonly organizationRepository: Repository<TbAccountOrganization>) {}

    async getTree() {
        const organizations = await this.organizationRepository.find({ order: { sort: 'ASC', keyId: 'ASC' } })
        return buildTree(organizations)
    }

    async findOne(uid: string): Promise<TbAccountOrganization> {
        const organization = await this.organizationRepository.findOne({ where: { uid: assertUid(uid, '组织UID') } })
        if (!organization) {
            throw new NotFoundException('组织不存在')
        }
        return organization
    }

    async create(input: CreateOrganizationDto): Promise<TbAccountOrganization> {
        return this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const parentUid = input.parentUid?.trim() || null
            await this.assertReferences(manager, parentUid, input.leaderUserUid)
            await this.assertCodeAvailable(manager, input.code)

            const organization = manager.create(TbAccountOrganization, {
                ...input,
                uid: generateUid(),
                parentUid: parentUid as unknown as string
            })
            const saved = await manager.save(organization)
            await this.rebuildClosure(manager)
            return saved
        })
    }

    async update(uid: string, input: UpdateOrganizationDto): Promise<TbAccountOrganization> {
        const normalizedUid = assertUid(uid, '组织UID')
        return this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const organization = await manager.findOneBy(TbAccountOrganization, { uid: normalizedUid })
            if (!organization) {
                throw new NotFoundException('组织不存在')
            }

            const nextParentUid = input.parentUid === undefined ? organization.parentUid : input.parentUid?.trim() || null
            if (nextParentUid === normalizedUid) {
                throw new BadRequestException('组织不能成为自己的父节点')
            }
            await this.assertReferences(manager, nextParentUid, input.leaderUserUid)
            if (input.code && input.code !== organization.code) {
                await this.assertCodeAvailable(manager, input.code, normalizedUid)
            }

            manager.merge(TbAccountOrganization, organization, input, { parentUid: nextParentUid as unknown as string })
            await manager.save(organization)
            await this.rebuildClosure(manager)
            return organization
        })
    }

    async remove(uid: string): Promise<void> {
        const normalizedUid = assertUid(uid, '组织UID')
        await this.organizationRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const organization = await manager.findOneBy(TbAccountOrganization, { uid: normalizedUid })
            if (!organization) {
                throw new NotFoundException('组织不存在')
            }
            if (await manager.existsBy(TbAccountOrganization, { parentUid: normalizedUid })) {
                throw new ConflictException('组织存在下级节点，不能删除')
            }
            if (await manager.existsBy(TbAccountUserOrganization, { organizationUid: normalizedUid })) {
                throw new ConflictException('组织仍有关联成员，不能删除')
            }
            if (await manager.existsBy(TbAccountRoleDataScopeOrganization, { organizationUid: normalizedUid })) {
                throw new ConflictException('组织仍被数据权限引用，不能删除')
            }
            await manager.delete(TbAccountOrganization, { uid: normalizedUid })
            await this.rebuildClosure(manager)
        })
    }

    private async assertReferences(manager: EntityManager, parentUid?: string | null, leaderUserUid?: string): Promise<void> {
        if (parentUid) {
            assertUid(parentUid, '父组织UID')
            const parent = await manager.findOneBy(TbAccountOrganization, { uid: parentUid })
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

    private async assertCodeAvailable(manager: EntityManager, code: string, excludedUid?: string): Promise<void> {
        const query = manager
            .getRepository(TbAccountOrganization)
            .createQueryBuilder('organization')
            .where('organization.code = :code', { code: code.trim() })
        if (excludedUid) {
            query.andWhere('organization.uid <> :excludedUid', { excludedUid })
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

        const byUid = new Map(organizations.map(organization => [organization.uid, organization]))
        const rows: Array<Pick<TbAccountOrganizationClosure, 'ancestorUid' | 'descendantUid' | 'depth'>> = []
        for (const organization of organizations) {
            rows.push({ ancestorUid: organization.uid, descendantUid: organization.uid, depth: 0 })
            let depth = 1
            let parentUid = organization.parentUid
            while (parentUid) {
                rows.push({ ancestorUid: parentUid, descendantUid: organization.uid, depth })
                parentUid = byUid.get(parentUid)?.parentUid
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
