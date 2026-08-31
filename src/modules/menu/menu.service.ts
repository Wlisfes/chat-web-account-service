import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountMenu, TbAccountMenuType, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { EntityManager, Repository } from 'typeorm'
import { PageResult, assertValidTree, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { CreateMenuDto, MenuColumnQueryDto, UpdateMenuDto } from '@/modules/menu/dto/menu.dto'

@Injectable()
export class MenuService {
    constructor(@InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>) {}

    async getTree() {
        const menus = await this.menuRepository.find({ order: { sort: 'ASC', keyId: 'ASC' } })
        return buildTree(menus)
    }

    async findPage(input: MenuColumnQueryDto): Promise<PageResult<TbAccountMenu>> {
        const query = this.menuRepository.createQueryBuilder('menu')
        if (input.parentKeyId === undefined || input.parentKeyId === null) {
            query.andWhere('menu.parentKeyId IS NULL')
        } else {
            query.andWhere('(menu.keyId = :parentKeyId OR menu.parentKeyId = :parentKeyId)', { parentKeyId: input.parentKeyId })
        }
        this.applyLikeFilter(query, 'menu.name', 'name', input.name)
        this.applyLikeFilter(query, 'menu.permissionCode', 'permissionCode', input.permissionCode)
        this.applyLikeFilter(query, 'menu.path', 'path', input.path)
        query.orderBy('menu.sort', 'ASC').addOrderBy('menu.keyId', 'ASC')
        query.skip((input.page - 1) * input.size).take(input.size)

        const [items, total] = await query.getManyAndCount()

        return {
            page: input.page,
            size: input.size,
            total,
            list: items
        }
    }

    async findOne(keyId: number): Promise<TbAccountMenu> {
        const menu = await this.menuRepository.findOne({ where: { keyId } })
        if (!menu) {
            throw new NotFoundException('菜单不存在')
        }
        return menu
    }

    async create(input: CreateMenuDto): Promise<TbAccountMenu> {
        return this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const parentKeyId = input.parentKeyId ?? null
            await this.assertParent(manager, parentKeyId)
            await this.assertPermissionCodeAvailable(manager, input.permissionCode)
            this.assertMenuFields(input)

            const menu = manager.create(TbAccountMenu, { ...input, parentKeyId: parentKeyId as unknown as number })
            return manager.save(menu)
        })
    }

    async update(keyId: number, input: UpdateMenuDto): Promise<TbAccountMenu> {
        return this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const menu = await manager.findOneBy(TbAccountMenu, { keyId })
            if (!menu) {
                throw new NotFoundException('菜单不存在')
            }

            const nextParentKeyId = input.parentKeyId === undefined ? menu.parentKeyId : (input.parentKeyId ?? null)
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('菜单不能成为自己的父节点')
            }
            await this.assertParent(manager, nextParentKeyId)
            if (input.permissionCode !== undefined && input.permissionCode !== menu.permissionCode) {
                await this.assertPermissionCodeAvailable(manager, input.permissionCode, keyId)
            }

            const nextMenu = { ...menu, ...input, parentKeyId: nextParentKeyId }
            this.assertMenuFields(nextMenu)
            manager.merge(TbAccountMenu, menu, input, { parentKeyId: nextParentKeyId as unknown as number })
            await manager.save(menu)

            const menus = await manager.find(TbAccountMenu)
            try {
                assertValidTree(menus, '菜单树')
            } catch (error) {
                throw new BadRequestException(error instanceof Error ? error.message : String(error))
            }
            return menu
        })
    }

    async remove(keyId: number): Promise<void> {
        await this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const menu = await manager.findOneBy(TbAccountMenu, { keyId })
            if (!menu) {
                throw new NotFoundException('菜单不存在')
            }
            if (await manager.existsBy(TbAccountMenu, { parentKeyId: keyId })) {
                throw new ConflictException('菜单存在下级节点，不能删除')
            }
            if (await manager.existsBy(TbAccountRoleMenu, { menuKeyId: keyId })) {
                throw new ConflictException('菜单仍被角色引用，不能删除')
            }
            await manager.delete(TbAccountMenu, { keyId })
        })
    }

    private async assertParent(manager: EntityManager, parentKeyId?: number | null): Promise<void> {
        if (!parentKeyId) {
            return
        }
        const parent = await manager.findOneBy(TbAccountMenu, { keyId: parentKeyId })
        if (!parent) {
            throw new BadRequestException('父菜单不存在')
        }
        if (parent.type === TbAccountMenuType.BUTTON) {
            throw new BadRequestException('按钮节点不能包含下级菜单')
        }
    }

    private async assertPermissionCodeAvailable(manager: EntityManager, permissionCode?: string, excludedKeyId?: number): Promise<void> {
        const normalized = permissionCode?.trim()
        if (!normalized) {
            return
        }
        const query = manager
            .getRepository(TbAccountMenu)
            .createQueryBuilder('menu')
            .where('menu.permissionCode = :permissionCode', { permissionCode: normalized })
        if (excludedKeyId) {
            query.andWhere('menu.keyId <> :excludedKeyId', { excludedKeyId })
        }
        if (await query.getExists()) {
            throw new ConflictException('菜单权限码已存在')
        }
    }

    private assertMenuFields(menu: Pick<TbAccountMenu, 'type' | 'permissionCode' | 'path' | 'externalUrl'>): void {
        if (menu.type === TbAccountMenuType.BUTTON && !menu.permissionCode?.trim()) {
            throw new BadRequestException('按钮节点必须配置权限码')
        }
        if (menu.type === TbAccountMenuType.MENU && !menu.path?.trim() && !menu.externalUrl?.trim()) {
            throw new BadRequestException('菜单节点必须配置路由路径或外部链接')
        }
    }

    private async lockTree(manager: EntityManager): Promise<void> {
        await manager.getRepository(TbAccountMenu).createQueryBuilder('menu').setLock('pessimistic_write').getMany()
    }

    private applyLikeFilter(
        query: ReturnType<Repository<TbAccountMenu>['createQueryBuilder']>,
        column: string,
        parameter: string,
        value?: string
    ): void {
        const normalized = value?.trim()
        if (!normalized) return
        query.andWhere(`${column} LIKE :${parameter} ESCAPE '\\\\'`, { [parameter]: `%${this.escapeLike(normalized)}%` })
    }

    private escapeLike(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    }
}
