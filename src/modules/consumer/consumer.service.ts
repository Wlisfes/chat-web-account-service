import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountConsumer,
    TbAccountConsumerAuthStatus,
    TbAccountConsumerClassType,
    TbAccountConsumerSource,
    TbAccountConsumerStage,
    TbAccountConsumerStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { generateUid, PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { ConsumerResponseDto, ConsumerSelectResponseDto } from '@/dto/api-response.dto'
import { ConsumerUtilsService } from '@/modules/consumer/consumer.utils.service'
import * as ConsumerDto from '@/modules/consumer/dto/consumer.dto'

@Injectable()
export class ConsumerService {
    constructor(
        @InjectRepository(TbAccountConsumer) private readonly repository: Repository<TbAccountConsumer>,
        private readonly database: DataBaseService,
        private readonly consumerUtilsService: ConsumerUtilsService
    ) {}

    /**新增客户*/
    public async httpBaseAccountCreateConsumer(
        principal: AuthPrincipal,
        input: ConsumerDto.CreateConsumerDto
    ): Promise<ConsumerResponseDto> {
        const consumer = this.repository.create({
            uid: generateUid(),
            ownerUserUid: principal.uid,
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
        return this.consumerUtilsService.toManagerContract(await this.repository.save(consumer))
    }

    /**编辑客户*/
    public async httpBaseAccountUpdateConsumer(input: ConsumerDto.UpdateConsumerDto): Promise<ConsumerResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const consumer = await this.consumerUtilsService.findRequired(input.keyId, manager)
            manager.merge(TbAccountConsumer, consumer, {
                name: input.name,
                alias: input.alias,
                brandKeyId: input.brandId,
                currency: input.currency,
                email: input.email,
                phone: input.phone,
                payMode: input.payMode,
                remark: input.remark
            })
            return this.consumerUtilsService.toManagerContract(await manager.save(consumer))
        })
    }

    /**更新客户状态*/
    public async httpBaseAccountUpdateConsumerStatus(input: ConsumerDto.UpdateConsumerStatusDto): Promise<ConsumerResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const consumer = await this.consumerUtilsService.findRequired(input.keyId, manager)
            consumer.status = input.status
            return this.consumerUtilsService.toManagerContract(await manager.save(consumer))
        })
    }

    /**客户分页数据*/
    public async httpBaseAccountColumnConsumer(input: ConsumerDto.ListConsumerDto): Promise<PageResult<ConsumerResponseDto>> {
        return this.database.builder(this.repository, async qb => {
            if (isNotEmpty(input.name?.trim())) {
                qb.andWhere('(t.name LIKE :name OR t.uid LIKE :name)', { name: `%${input.name?.trim()}%` })
            }
            if (isNotEmpty(input.status)) qb.andWhere('t.status = :status', { status: input.status })
            if (isNotEmpty(input.brandId)) qb.andWhere('t.brandKeyId = :brandKeyId', { brandKeyId: input.brandId })
            if (isNotEmpty(input.currency)) qb.andWhere('t.currency = :currency', { currency: input.currency })
            if (isNotEmpty(input.payMode)) qb.andWhere('t.payMode = :payMode', { payMode: input.payMode })
            if (isNotEmpty(input.authStatus)) qb.andWhere('t.authStatus = :authStatus', { authStatus: input.authStatus })
            if (isNotEmpty(input.source)) qb.andWhere('t.source = :source', { source: input.source })
            qb.orderBy('t.createTime', 'DESC')
                .skip((input.page - 1) * input.size)
                .take(input.size)
            const [consumerList, total] = await qb.getManyAndCount()
            return {
                page: input.page,
                size: input.size,
                total,
                list: await this.consumerUtilsService.toManagerContracts(consumerList)
            }
        })
    }

    /**客户详情*/
    public async httpBaseAccountResolverConsumer(query: ConsumerDto.ResolveConsumerDto): Promise<ConsumerResponseDto> {
        const [consumer] = await this.consumerUtilsService.toManagerContracts([await this.consumerUtilsService.findRequired(query.keyId)])
        return consumer
    }

    /**客户下拉列表*/
    public async httpBaseAccountSelectConsumer(query: ConsumerDto.SelectConsumerDto): Promise<ConsumerSelectResponseDto[]> {
        return this.database.builder(this.repository, async qb => {
            qb.where('t.status = :status', { status: TbAccountConsumerStatus.ENABLE })
                .orderBy('t.name', 'ASC')
                .addOrderBy('t.keyId', 'ASC')
                .take(200)
            if (isNotEmpty(query.name?.trim())) {
                qb.andWhere('(t.name LIKE :name OR t.alias LIKE :name OR t.uid LIKE :name)', { name: `%${query.name?.trim()}%` })
            }
            return (await qb.getMany()).map(consumer => ({
                keyId: consumer.keyId,
                uid: consumer.uid,
                ownerUserUid: consumer.ownerUserUid,
                name: consumer.name,
                alias: consumer.alias,
                brandId: consumer.brandKeyId,
                currency: consumer.currency,
                email: consumer.email,
                phone: consumer.phone,
                status: consumer.status
            }))
        })
    }
}
