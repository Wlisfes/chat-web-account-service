import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountPosition, TbAccountUserPosition } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageResult } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { PositionUtilsService } from '@/modules/position/position.utils.service'
import * as PositionDto from '@/modules/position/dto/position.dto'
import { PositionResponseDto } from '@/dto/api-response.dto'

@Injectable()
export class PositionService {
    constructor(
        @InjectRepository(TbAccountPosition) private readonly repository: Repository<TbAccountPosition>,
        private readonly database: DataBaseService,
        private readonly positionUtilsService: PositionUtilsService
    ) {}

    /**新增职位。*/
    public async httpBaseAccountCreatePosition(input: PositionDto.CreatePositionDto): Promise<PositionResponseDto> {
        const name = input.name?.trim()
        if (!isNotEmpty(name)) throw new BadRequestException('职位名称必填')
        return this.repository.manager.transaction(async manager => {
            await this.positionUtilsService.ensureNameAvailable(name, undefined, manager)
            const position = manager.create(TbAccountPosition, { name, sort: input.sort ?? 0 })
            return this.toResponse(await manager.save(position), manager)
        })
    }

    /**更新职位。*/
    public async httpBaseAccountUpdatePosition(input: PositionDto.UpdatePositionDto): Promise<PositionResponseDto> {
        return this.repository.manager.transaction(async manager => {
            const position = await this.positionUtilsService.findRequired(input.keyId, manager, true)
            const name = input.name?.trim()
            if (isNotEmpty(name) && name !== position.name) {
                await this.positionUtilsService.ensureNameAvailable(name, input.keyId, manager)
                position.name = name
            }
            if (isNotEmpty(input.sort)) position.sort = input.sort
            return this.toResponse(await manager.save(position), manager)
        })
    }

    /**职位详情。*/
    public async httpBaseAccountPositionResolver(query: PositionDto.PositionKeyDto): Promise<PositionResponseDto> {
        return this.toResponse(await this.positionUtilsService.findRequired(query.keyId))
    }

    /**职位分页列表。*/
    public async httpBaseAccountColumnPosition(input: PositionDto.ListPositionDto): Promise<PageResult<PositionResponseDto>> {
        return this.database.builder(this.repository, async qb => {
            if (isNotEmpty(input.name?.trim())) qb.andWhere('t.name LIKE :name', { name: `%${input.name.trim()}%` })
            qb.orderBy('t.sort', 'ASC')
                .addOrderBy('t.keyId', 'ASC')
                .skip((input.page - 1) * input.size)
                .take(input.size)
            const [list, total] = await qb.getManyAndCount()
            return { page: input.page, size: input.size, total, list: await Promise.all(list.map(position => this.toResponse(position))) }
        })
    }

    /**删除职位。*/
    public async httpBaseAccountDeletePosition(input: PositionDto.PositionKeyDto): Promise<SuccessResponseDataDto> {
        await this.repository.manager.transaction(async manager => {
            const position = await this.positionUtilsService.findRequired(input.keyId, manager, true)
            if ((await this.positionUtilsService.countAssignedAccounts(manager, position)) > 0) {
                throw new BadRequestException('职位已关联员工，无法删除')
            }
            await manager.delete(TbAccountUserPosition, { positionKeyId: position.keyId })
            await manager.delete(TbAccountPosition, { keyId: position.keyId })
        })
        return { success: true }
    }

    /**职位下拉选项。*/
    public async httpBaseAccountSelectPosition(
        query: PositionDto.SelectPositionDto
    ): Promise<Array<Pick<PositionResponseDto, 'keyId' | 'name'>>> {
        return this.database.builder(this.repository, async qb => {
            if (isNotEmpty(query.name?.trim())) qb.andWhere('t.name LIKE :name', { name: `%${query.name.trim()}%` })
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').take(200)
            return (await qb.getMany()).map(position => ({ keyId: position.keyId, name: position.name }))
        })
    }

    private async toResponse(position: TbAccountPosition, manager = this.repository.manager): Promise<PositionResponseDto> {
        const accountCount = await this.positionUtilsService.countAssignedAccounts(manager, position)
        return {
            keyId: position.keyId,
            name: position.name,
            sort: position.sort,
            accountCount,
            createTime: position.createTime,
            modifyTime: position.modifyTime
        }
    }
}
