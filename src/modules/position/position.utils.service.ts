import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountPosition, TbAccountUserOrganization, TbAccountUserPosition } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isEmpty, isNotEmpty } from 'class-validator'
import { EntityManager, Repository } from 'typeorm'

@Injectable()
export class PositionUtilsService {
    constructor(
        @InjectRepository(TbAccountPosition) private readonly repository: Repository<TbAccountPosition>,
        private readonly database: DataBaseService
    ) {}

    /**查找职位，不存在时抛出异常。*/
    public async findRequired(keyId: number, manager?: EntityManager, lock = false): Promise<TbAccountPosition> {
        if (isEmpty(keyId)) throw new BadRequestException('职位ID不能为空')
        const position = manager
            ? await manager.findOne(TbAccountPosition, {
                  where: { keyId },
                  ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {})
              })
            : await this.database.builder(this.repository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        if (!position) throw new NotFoundException('职位不存在')
        return position
    }

    /**检查职位名称是否可用。*/
    public async ensureNameAvailable(name: string, keyId?: number, manager?: EntityManager): Promise<void> {
        const repository = manager?.getRepository(TbAccountPosition) ?? this.repository
        const exists = await this.database.builder(repository, qb => {
            qb.where('t.name = :name', { name })
            if (isNotEmpty(keyId)) qb.andWhere('t.keyId <> :keyId', { keyId })
            return qb.getExists()
        })
        if (exists) throw new BadRequestException('职位名称已存在')
    }

    /**统计职位关联的员工数量，兼容历史组织关系中的岗位名称。*/
    public async countAssignedAccounts(manager: EntityManager, position: TbAccountPosition): Promise<number> {
        const accountRepository = manager.getRepository(TbAccountUserPosition)
        const legacyRepository = manager.getRepository(TbAccountUserOrganization)
        const [accountCount, legacyAccountCount] = await Promise.all([
            this.database.builder(accountRepository, async qb => {
                const result = await qb
                    .select('COUNT(DISTINCT t.user_uid)', 'count')
                    .where('t.positionKeyId = :positionKeyId', { positionKeyId: position.keyId })
                    .getRawOne<{ count: string }>()
                return Number(result?.count ?? 0)
            }),
            this.database.builder(legacyRepository, qb =>
                qb
                    .select('COUNT(DISTINCT t.user_uid)', 'count')
                    .where('t.positionName = :positionName', { positionName: position.name })
                    .andWhere(
                        `NOT EXISTS (
                            SELECT 1
                            FROM tb_account_user_position existing_position
                            WHERE existing_position.user_uid = t.user_uid
                              AND existing_position.position_key_id = :positionKeyId
                        )`,
                        { positionKeyId: position.keyId }
                    )
                    .getRawOne<{ count: string }>()
                    .then(result => Number(result?.count ?? 0))
            )
        ])
        return accountCount + legacyAccountCount
    }
}
