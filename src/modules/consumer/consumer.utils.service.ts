import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountConsumer,
    TbAccountOrganization,
    TbAccountUser,
    TbAccountUserOrganization
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from 'class-validator'
import { EntityManager, In, Repository } from 'typeorm'
import { AccountUserSummaryResponseDto, ConsumerResponseDto } from '@/dto/api-response.dto'

@Injectable()
export class ConsumerUtilsService {
    constructor(
        @InjectRepository(TbAccountConsumer) private readonly consumerRepository: Repository<TbAccountConsumer>,
        private readonly database: DataBaseService
    ) {}

    /** 获取必需的客户详情。 */
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbAccountConsumer> {
        const repository = (manager ?? this.consumerRepository.manager).getRepository(TbAccountConsumer)
        const consumer = await this.database.builder(repository, qb => {
            qb.where('t.keyId = :keyId', { keyId })
            if (isNotEmpty(manager)) {
                qb.setLock('pessimistic_write')
            }
            return qb.getOne()
        })
        if (!consumer) {
            throw new NotFoundException('客户不存在')
        }
        return consumer
    }

    /** 将客户实体转换为管理端合同结构。 */
    public toManagerContract(
        consumer: TbAccountConsumer,
        owner?: TbAccountUser,
        organizations: TbAccountOrganization[] = []
    ): ConsumerResponseDto {
        return {
            ...consumer,
            userId: consumer.ownerUserUid,
            brandId: consumer.brandKeyId,
            accountOptions: isNotEmpty(owner)
                ? { uid: owner.uid, number: owner.number, name: owner.name, avatar: owner.avatar }
                : ({ uid: consumer.ownerUserUid, number: consumer.ownerUserUid, name: '未知账号' } as AccountUserSummaryResponseDto),
            deptOptions: organizations.map(organization => ({
                keyId: organization.keyId,
                name: organization.name,
                deptName: organization.name
            })),
            tags: []
        }
    }

    /** 批量补充客户归属人和组织信息。 */
    public async toManagerContracts(consumers: TbAccountConsumer[]): Promise<ConsumerResponseDto[]> {
        const ownerUserUids = [...new Set(consumers.map(consumer => consumer.ownerUserUid))]
        if (ownerUserUids.length === 0) return []
        const [owners, memberships] = await Promise.all([
            this.consumerRepository.manager.find(TbAccountUser, { where: { uid: In(ownerUserUids) } }),
            this.consumerRepository.manager.find(TbAccountUserOrganization, { where: { userUid: In(ownerUserUids) } })
        ])
        const organizationKeyIds = [...new Set(memberships.map(membership => membership.organizationKeyId))]
        const organizations =
            organizationKeyIds.length > 0
                ? await this.consumerRepository.manager.find(TbAccountOrganization, { where: { keyId: In(organizationKeyIds) } })
                : []
        const ownerByUid = new Map(owners.map(owner => [owner.uid, owner]))
        const organizationByKeyId = new Map(organizations.map(organization => [organization.keyId, organization]))
        const organizationsByOwnerUid = new Map<string, TbAccountOrganization[]>()
        for (const membership of memberships) {
            const organization = organizationByKeyId.get(membership.organizationKeyId)
            if (!organization) continue
            const ownerOrganizations = organizationsByOwnerUid.get(membership.userUid) ?? []
            ownerOrganizations.push(organization)
            organizationsByOwnerUid.set(membership.userUid, ownerOrganizations)
        }
        return consumers.map(consumer =>
            this.toManagerContract(
                consumer,
                ownerByUid.get(consumer.ownerUserUid),
                organizationsByOwnerUid.get(consumer.ownerUserUid) ?? []
            )
        )
    }
}
