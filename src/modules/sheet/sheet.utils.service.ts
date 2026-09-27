import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { TbAccountSheet, TbAccountSheetType } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService, InjectRepository, EntityManager, Repository } from '@wlisfes/chat-web-base-schema/database'
import { assertValidTree, isEmpty, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'

@Injectable()
export class SheetUtilsService {
    constructor(
        @InjectRepository(TbAccountSheet) private readonly sheetRepository: Repository<TbAccountSheet>,
        private readonly database: DataBaseService
    ) {}

    /**锁定菜单表**/
    public async lockTree(manager: EntityManager): Promise<void> {
        await this.database.builder(manager.getRepository(TbAccountSheet), qb => {
            return qb.setLock('pessimistic_write').getMany()
        })
    }

    /**获取菜单详情**/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbAccountSheet> {
        let sheet: TbAccountSheet | null = null
        if (isEmpty(keyId)) {
            throw new BadRequestException('菜单ID不能为空')
        }
        if (isNotEmpty(manager)) {
            sheet = await manager.findOneBy(TbAccountSheet, { keyId })
        } else {
            sheet = await this.database.builder(this.sheetRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        }
        if (!sheet) {
            throw new NotFoundException('菜单不存在')
        }
        return sheet
    }

    /**获取父菜单详情**/
    public async findParentRequired(parentKeyId?: number | null, manager?: EntityManager): Promise<TbAccountSheet | null> {
        if (isEmpty(parentKeyId)) {
            return null
        }
        return await this.findRequired(parentKeyId, manager).then(data => {
            if (data.type === TbAccountSheetType.BUTTON) {
                throw new BadRequestException('按钮节点不能包含下级菜单')
            }
            return data
        })
    }

    /**校验菜单权限码**/
    public async findPermissionCodeAvailable(manager: EntityManager, permissionCode?: string, excludedKeyId?: number): Promise<void> {
        const normalized = permissionCode?.trim()
        if (!normalized) {
            return
        }
        const exists = await this.database.builder(manager.getRepository(TbAccountSheet), qb => {
            qb.where('t.permissionCode = :permissionCode', { permissionCode: normalized })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('菜单权限码已存在')
        }
    }

    /**校验菜单字段**/
    public findSheetFieldsRequired(sheet: Pick<TbAccountSheet, 'type' | 'permissionCode' | 'path' | 'externalUrl'>): void {
        if (sheet.type === TbAccountSheetType.BUTTON && !sheet.permissionCode?.trim()) {
            throw new BadRequestException('按钮节点必须配置权限码')
        }
        if (sheet.type === TbAccountSheetType.DIRECTORY && !sheet.path?.trim()) {
            throw new BadRequestException('目录节点必须配置菜单地址')
        }
        if (sheet.type === TbAccountSheetType.MENU && !sheet.path?.trim() && !sheet.externalUrl?.trim()) {
            throw new BadRequestException('菜单节点必须配置路由路径或外部链接')
        }
    }

    /**校验菜单树结构**/
    public async findAssertTree(manager: EntityManager): Promise<void> {
        const sheets = await manager.find(TbAccountSheet)
        try {
            return assertValidTree(sheets, '菜单树')
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
    }
}
