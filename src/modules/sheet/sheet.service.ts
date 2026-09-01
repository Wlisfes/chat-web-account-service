import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { TbAccountMenu, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PageResult, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { SheetTreeNodeResponseDto } from '@/dto/api-response.dto'
import { SheetUtilsService } from '@/modules/sheet/sheet.utils.service'
import { isNotEmpty } from 'class-validator'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as SheetDto from '@/modules/sheet/dto/sheet.dto'

@Injectable()
export class SheetService {
    constructor(
        @InjectRepository(TbAccountMenu) private readonly sheetRepository: Repository<TbAccountMenu>,
        private readonly database: DataBaseService,
        private readonly sheetUtilsService: SheetUtilsService
    ) {}

    /**菜单树结构**/
    public async httpBaseAccountSheetTree(): Promise<SheetTreeNodeResponseDto[]> {
        const sheets = await this.database.builder(this.sheetRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        return buildTree(sheets)
    }

    /**菜单分页数据**/
    public async httpBaseAccountColumnSheet(body: SheetDto.SheetColumnQueryDto): Promise<PageResult<TbAccountMenu>> {
        return this.database.builder(this.sheetRepository, async qb => {
            if (isNotEmpty(body.parentKeyId)) {
                qb.where('(t.keyId = :parentKeyId OR t.parentKeyId = :parentKeyId)', { parentKeyId: body.parentKeyId })
                qb.orderBy('CASE WHEN t.keyId = :parentKeyId THEN 0 ELSE 1 END', 'ASC')
                qb.addOrderBy('t.sort', 'ASC')
            } else {
                qb.where('t.parentKeyId IS NULL')
                qb.orderBy('t.sort', 'ASC')
            }
            if (isNotEmpty(body.name)) {
                qb.andWhere('t.name LIKE :name', { name: `%${body.name.trim()}%` })
            }
            if (isNotEmpty(body.permissionCode)) {
                qb.andWhere('t.permissionCode LIKE :permissionCode', { permissionCode: `%${body.permissionCode.trim()}%` })
            }
            if (isNotEmpty(body.path)) {
                qb.andWhere('t.path LIKE :path', { path: `%${body.path.trim()}%` })
            }
            qb.addOrderBy('t.keyId', 'ASC')
            qb.skip((body.page - 1) * body.size).take(body.size)
            return await qb.getManyAndCount().then(([list, total]) => {
                return { page: body.page, size: body.size, list, total }
            })
        })
    }

    /**菜单详情**/
    public async httpBaseAccountSheetResolver(query: SheetDto.SheetKeyDto): Promise<TbAccountMenu> {
        return this.sheetUtilsService.findRequired(query.keyId)
    }

    /**新增菜单**/
    public async httpBaseAccountCreateSheet(body: SheetDto.CreateSheetDto): Promise<TbAccountMenu> {
        return this.sheetRepository.manager.transaction(async manager => {
            await this.sheetUtilsService.lockTree(manager)
            await this.sheetUtilsService.findParentRequired(body.parentKeyId, manager)
            await this.sheetUtilsService.findPermissionCodeAvailable(manager, body.permissionCode)
            await this.sheetUtilsService.findSheetFieldsRequired(body)
            const sheet = manager.create(TbAccountMenu, { ...body, parentKeyId: body.parentKeyId })
            return manager.save(sheet)
        })
    }

    /**编辑菜单**/
    public async httpBaseAccountUpdateSheet(body: SheetDto.UpdateSheetPayloadDto): Promise<TbAccountMenu> {
        const { keyId, ...input } = body
        return this.sheetRepository.manager.transaction(async manager => {
            await this.sheetUtilsService.lockTree(manager)
            const sheet = await this.sheetUtilsService.findRequired(keyId, manager)

            const nextParentKeyId = input.parentKeyId === undefined ? sheet.parentKeyId : (input.parentKeyId ?? null)
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('菜单不能成为自己的父节点')
            }
            await this.sheetUtilsService.findParentRequired(nextParentKeyId, manager)
            if (isNotEmpty(input.permissionCode) && input.permissionCode !== sheet.permissionCode) {
                await this.sheetUtilsService.findPermissionCodeAvailable(manager, input.permissionCode, keyId)
            }
            await manager.merge(TbAccountMenu, sheet, input, { parentKeyId: nextParentKeyId })
            await this.sheetUtilsService.findSheetFieldsRequired(sheet)
            await manager.save(sheet)
            return await this.sheetUtilsService.findAssertTree(manager).then(() => {
                return sheet
            })
        })
    }

    /**删除菜单**/
    public async httpBaseAccountDeleteSheet(body: SheetDto.SheetKeyDto): Promise<SuccessResponseDataDto> {
        await this.sheetRepository.manager.transaction(async manager => {
            await this.sheetUtilsService.lockTree(manager)
            await this.sheetUtilsService.findRequired(body.keyId, manager)
            if (await manager.existsBy(TbAccountMenu, { parentKeyId: body.keyId })) {
                throw new ConflictException('菜单存在下级节点，不能删除')
            }
            if (await manager.existsBy(TbAccountRoleMenu, { menuKeyId: body.keyId })) {
                throw new ConflictException('菜单仍被角色引用，不能删除')
            }
            return await manager.delete(TbAccountMenu, { keyId: body.keyId })
        })
        return { success: true }
    }
}
