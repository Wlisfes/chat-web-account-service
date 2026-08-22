import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountConsumer,
    TbAccountConsumerAuthStatus,
    TbAccountConsumerClassType,
    TbAccountConsumerSource,
    TbAccountConsumerStage,
    TbAccountConsumerStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { Repository } from 'typeorm'
import { generateUid } from '@/common/uid'
import { CreateConsumerDto, ListConsumerDto, UpdateConsumerDto, UpdateConsumerStatusDto } from '@/modules/consumers/dto/consumer.dto'

@Injectable()
export class ConsumersService {
    constructor(@InjectRepository(TbAccountConsumer) private readonly repository: Repository<TbAccountConsumer>) {}

    async create(actorUid: string, input: CreateConsumerDto) {
        const consumer = this.repository.create({
            uid: generateUid(),
            ownerUserUid: actorUid,
            name: input.name,
            alias: input.alias,
            brandKeyId: input.brandId,
            currency: input.currency,
            email: input.email,
            phone: input.phone,
            status: input.status ?? TbAccountConsumerStatus.ENABLE,
            payMode: input.payMode,
            classType: TbAccountConsumerClassType.COMMON,
            balance: 0,
            balanceUsd: 0,
            credit: 0,
            creditUsd: 0,
            level: 1,
            stage: TbAccountConsumerStage.CLUETRAIL,
            authStatus: input.authStatus ?? TbAccountConsumerAuthStatus.UNVERIFIED,
            source: input.source ?? TbAccountConsumerSource.MANUAL,
            remark: input.remark
        })
        return this.toManagerContract(await this.repository.save(consumer))
    }

    async update(input: UpdateConsumerDto) {
        const consumer = await this.findRequired(input.keyId)
        this.repository.merge(consumer, {
            name: input.name,
            alias: input.alias,
            brandKeyId: input.brandId,
            currency: input.currency,
            email: input.email,
            phone: input.phone,
            payMode: input.payMode,
            remark: input.remark
        })
        return this.toManagerContract(await this.repository.save(consumer))
    }

    async updateStatus(input: UpdateConsumerStatusDto) {
        const consumer = await this.findRequired(input.keyId)
        consumer.status = input.status
        return this.toManagerContract(await this.repository.save(consumer))
    }

    async list(input: ListConsumerDto) {
        const query = this.repository.createQueryBuilder('consumer')
        if (input.name?.trim()) {
            query.andWhere('(consumer.name LIKE :name OR consumer.uid LIKE :name)', { name: `%${input.name.trim()}%` })
        }
        if (input.status) query.andWhere('consumer.status = :status', { status: input.status })
        if (input.brandId) query.andWhere('consumer.brandKeyId = :brandKeyId', { brandKeyId: input.brandId })
        if (input.currency) query.andWhere('consumer.currency = :currency', { currency: input.currency })
        if (input.payMode) query.andWhere('consumer.payMode = :payMode', { payMode: input.payMode })
        if (input.authStatus) query.andWhere('consumer.authStatus = :authStatus', { authStatus: input.authStatus })
        if (input.source) query.andWhere('consumer.source = :source', { source: input.source })
        query
            .orderBy('consumer.createTime', 'DESC')
            .skip((input.page - 1) * input.size)
            .take(input.size)
        const [consumers, total] = await query.getManyAndCount()
        return {
            page: input.page,
            size: input.size,
            total,
            list: consumers.map(consumer => this.toManagerContract(consumer))
        }
    }

    private toManagerContract(consumer: TbAccountConsumer) {
        return {
            ...consumer,
            userId: consumer.ownerUserUid,
            brandId: consumer.brandKeyId,
            accountOptions: { uid: consumer.ownerUserUid },
            deptOptions: [],
            tags: []
        }
    }

    private async findRequired(keyId: number) {
        const consumer = await this.repository.findOneBy({ keyId })
        if (!consumer) throw new NotFoundException('客户不存在')
        return consumer
    }
}
