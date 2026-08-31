import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { TbAccountMenu, TbAccountMenuType } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { assertValidTree } from '@wlisfes/chat-web-base-schema/utils'
import { isEmpty, isNotEmpty } from 'class-validator'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

@Injectable()
export class MenuUtilsService {
    constructor(
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        private readonly database: DataBaseService
    ) {}

    /**锁定菜单表**/
    public async lockTree(manager: EntityManager): Promise<void> {
        await this.database.builder(manager.getRepository(TbAccountMenu), qb => {
            return qb.setLock('pessimistic_write').getMany()
        })
    }

    /**获取菜单详情**/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbAccountMenu> {
        let menu: TbAccountMenu | null = null
        if (isEmpty(keyId)) {
            throw new BadRequestException('菜单ID不能为空')
        }
        if (isNotEmpty(manager)) {
            menu = await manager.findOneBy(TbAccountMenu, { keyId })
        } else {
            menu = await this.database.builder(this.menuRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        }
        if (!menu) {
            throw new NotFoundException('菜单不存在')
        }
        return menu
    }

    /**获取父菜单详情**/
    public async findParentRequired(parentKeyId: number, manager?: EntityManager): Promise<TbAccountMenu> {
        return await this.findRequired(parentKeyId, manager).then(data => {
            if (data.type === TbAccountMenuType.BUTTON) {
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
        const exists = await this.database.builder(manager.getRepository(TbAccountMenu), qb => {
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
    public findMenuFieldsRequired(menu: Pick<TbAccountMenu, 'type' | 'permissionCode' | 'path' | 'externalUrl'>): void {
        if (menu.type === TbAccountMenuType.BUTTON && !menu.permissionCode?.trim()) {
            throw new BadRequestException('按钮节点必须配置权限码')
        }
        if (menu.type === TbAccountMenuType.MENU && !menu.path?.trim() && !menu.externalUrl?.trim()) {
            throw new BadRequestException('菜单节点必须配置路由路径或外部链接')
        }
    }

    /**校验菜单树结构**/
    public async findAssertTree(manager: EntityManager): Promise<void> {
        const menus = await manager.find(TbAccountMenu)
        try {
            return assertValidTree(menus, '菜单树')
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
    }
}
