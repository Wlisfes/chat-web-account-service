import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountMenu, TbAccountMenuType, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { EntityManager, Repository } from 'typeorm'
import { assertUid, generateUid } from '@/common/uid'
import { assertValidTree, buildTree } from '@/common/tree'
import { CreateMenuDto, UpdateMenuDto } from '@/modules/menus/dto/menu.dto'

@Injectable()
export class MenusService {
    constructor(@InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>) {}

    async getTree() {
        const menus = await this.menuRepository.find({ order: { sort: 'ASC', keyId: 'ASC' } })
        return buildTree(menus)
    }

    async findOne(uid: string): Promise<TbAccountMenu> {
        const menu = await this.menuRepository.findOne({ where: { uid: assertUid(uid, '菜单UID') } })
        if (!menu) {
            throw new NotFoundException('菜单不存在')
        }
        return menu
    }

    async create(input: CreateMenuDto): Promise<TbAccountMenu> {
        return this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const parentUid = input.parentUid?.trim() || null
            await this.assertParent(manager, parentUid)
            await this.assertPermissionCodeAvailable(manager, input.permissionCode)
            this.assertMenuFields(input)

            const menu = manager.create(TbAccountMenu, { ...input, uid: generateUid(), parentUid: parentUid as unknown as string })
            return manager.save(menu)
        })
    }

    async update(uid: string, input: UpdateMenuDto): Promise<TbAccountMenu> {
        const normalizedUid = assertUid(uid, '菜单UID')
        return this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const menu = await manager.findOneBy(TbAccountMenu, { uid: normalizedUid })
            if (!menu) {
                throw new NotFoundException('菜单不存在')
            }

            const nextParentUid = input.parentUid === undefined ? menu.parentUid : input.parentUid?.trim() || null
            if (nextParentUid === normalizedUid) {
                throw new BadRequestException('菜单不能成为自己的父节点')
            }
            await this.assertParent(manager, nextParentUid)
            if (input.permissionCode !== undefined && input.permissionCode !== menu.permissionCode) {
                await this.assertPermissionCodeAvailable(manager, input.permissionCode, normalizedUid)
            }

            const nextMenu = { ...menu, ...input, parentUid: nextParentUid }
            this.assertMenuFields(nextMenu)
            manager.merge(TbAccountMenu, menu, input, { parentUid: nextParentUid as unknown as string })
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

    async remove(uid: string): Promise<void> {
        const normalizedUid = assertUid(uid, '菜单UID')
        await this.menuRepository.manager.transaction(async manager => {
            await this.lockTree(manager)
            const menu = await manager.findOneBy(TbAccountMenu, { uid: normalizedUid })
            if (!menu) {
                throw new NotFoundException('菜单不存在')
            }
            if (await manager.existsBy(TbAccountMenu, { parentUid: normalizedUid })) {
                throw new ConflictException('菜单存在下级节点，不能删除')
            }
            if (await manager.existsBy(TbAccountRoleMenu, { menuUid: normalizedUid })) {
                throw new ConflictException('菜单仍被角色引用，不能删除')
            }
            await manager.delete(TbAccountMenu, { uid: normalizedUid })
        })
    }

    private async assertParent(manager: EntityManager, parentUid?: string | null): Promise<void> {
        if (!parentUid) {
            return
        }
        assertUid(parentUid, '父菜单UID')
        const parent = await manager.findOneBy(TbAccountMenu, { uid: parentUid })
        if (!parent) {
            throw new BadRequestException('父菜单不存在')
        }
        if (parent.type === TbAccountMenuType.BUTTON) {
            throw new BadRequestException('按钮节点不能包含下级菜单')
        }
    }

    private async assertPermissionCodeAvailable(manager: EntityManager, permissionCode?: string, excludedUid?: string): Promise<void> {
        const normalized = permissionCode?.trim()
        if (!normalized) {
            return
        }
        const query = manager
            .getRepository(TbAccountMenu)
            .createQueryBuilder('menu')
            .where('menu.permissionCode = :permissionCode', { permissionCode: normalized })
        if (excludedUid) {
            query.andWhere('menu.uid <> :excludedUid', { excludedUid })
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
}
