import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { PageResult, buildTree, isNotEmpty, fetchResolver } from '@wlisfes/chat-web-base-schema/utils'
import { Repository, InjectRepository, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { AuthorizationService } from '@/modules/authorization/authorization.service'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { SheetUtilsService } from '@/modules/sheet/sheet.utils.service'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as SheetDto from '@/modules/sheet/dto/sheet.dto'

@Injectable()
export class SheetService {
    constructor(
        @InjectRepository(Schema.TbAccountMenu) private readonly sheetRepository: Repository<Schema.TbAccountMenu>,
        private readonly database: DataBaseService,
        private readonly sheetUtilsService: SheetUtilsService,
        private readonly permissionCacheService: AuthorizationService
    ) {}

    /**菜单静态枚举**/
    public async httpBaseAccountSheetEnums(): Promise<SheetDto.SheetEnumsResponseDto> {
        return {
            typeOptions: Schema.TbAccountMenuTypeDefinition.options,
            statusOptions: Schema.TbAccountMenuStatusDefinition.options,
            visibleOptions: Schema.TbAccountMenuVisibleDefinition.options
        }
    }

    /**菜单详情**/
    public async httpBaseAccountSheetResolver(query: SheetDto.SheetKeyDto): Promise<Schema.TbAccountMenu> {
        return this.sheetUtilsService.findRequired(query.keyId)
    }

    /**菜单树结构**/
    public async httpBaseAccountSheetTree(): Promise<PageResult<Schema.TbAccountMenu>> {
        return await this.database.builder(this.sheetRepository, async qb => {
            qb.orderBy('t.sort', 'ASC')
            qb.addOrderBy('t.keyId', 'ASC')
            return await qb.getMany().then(nodes => {
                return fetchResolver({ list: buildTree(nodes) })
            })
        })
    }

    /**菜单分页数据**/
    public async httpBaseAccountColumnSheet(body: SheetDto.SheetColumnQueryDto): Promise<PageResult<Schema.TbAccountMenu>> {
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
                return fetchResolver({ page: body.page, size: body.size, list, total })
            })
        })
    }

    /**新增菜单**/
    public async httpBaseAccountCreateSheet(body: SheetDto.CreateSheetDto): Promise<Schema.TbAccountMenu> {
        return await this.sheetRepository.manager.transaction(async manager => {
            await this.sheetUtilsService.lockTree(manager)
            await this.sheetUtilsService.findParentRequired(body.parentKeyId, manager)
            await this.sheetUtilsService.findPermissionCodeAvailable(manager, body.permissionCode)
            await this.sheetUtilsService.findSheetFieldsRequired(body)
            const sheet = manager.create(Schema.TbAccountMenu, { ...body, parentKeyId: body.parentKeyId })
            return manager.save(sheet).then(async saved => {
                await this.sheetUtilsService.findAssertTree(manager)
                return saved
            })
        })
    }

    /**编辑菜单**/
    public async httpBaseAccountUpdateSheet(body: SheetDto.UpdateSheetPayloadDto): Promise<Schema.TbAccountMenu> {
        const { keyId, ...input } = body
        return await this.sheetRepository.manager.transaction(async manager => {
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
            await manager.merge(Schema.TbAccountMenu, sheet, input, { parentKeyId: nextParentKeyId })
            await this.sheetUtilsService.findSheetFieldsRequired(sheet)
            await manager.save(sheet)
            return await this.sheetUtilsService.findAssertTree(manager).then(async () => {
                await this.permissionCacheService.invalidate({})
                return sheet
            })
        })
    }

    /**删除菜单**/
    public async httpBaseAccountDeleteSheet(body: SheetDto.SheetKeyDto): Promise<SuccessResponseDataDto> {
        return await this.sheetRepository.manager.transaction(async manager => {
            await this.sheetUtilsService.lockTree(manager)
            await this.sheetUtilsService.findRequired(body.keyId, manager)
            if (await manager.existsBy(Schema.TbAccountMenu, { parentKeyId: body.keyId })) {
                throw new ConflictException('菜单存在下级节点，不能删除')
            }
            if (await manager.existsBy(Schema.TbAccountRoleMenu, { menuKeyId: body.keyId })) {
                throw new ConflictException('菜单仍被角色引用，不能删除')
            }
            return await manager.delete(Schema.TbAccountMenu, { keyId: body.keyId }).then(async node => {
                await this.permissionCacheService.invalidate({})
                return { ...node, success: true }
            })
        })
    }
}
