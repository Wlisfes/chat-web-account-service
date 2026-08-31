import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { TbAccountMenu, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PageResult, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { MenuTreeNodeResponseDto } from '@/dto/api-response.dto'
import { MenuUtilsService } from '@/modules/menu/menu.utils.service'
import { isNotEmpty } from 'class-validator'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as MenuDto from '@/modules/menu/dto/menu.dto'

@Injectable()
export class MenuService {
    constructor(
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        private readonly database: DataBaseService,
        private readonly menuUtilsService: MenuUtilsService
    ) {}

    /**菜单树结构**/
    public async httpBaseAccountMenuTree(): Promise<MenuTreeNodeResponseDto[]> {
        const menus = await this.database.builder(this.menuRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        return buildTree(menus)
    }

    /**菜单分页数据**/
    public async httpBaseAccountColumnMenu(body: MenuDto.MenuColumnQueryDto): Promise<PageResult<TbAccountMenu>> {
        return this.database.builder(this.menuRepository, async qb => {
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
    public async httpBaseAccountMenuResolver(query: MenuDto.MenuKeyDto): Promise<TbAccountMenu> {
        return this.menuUtilsService.findRequired(query.keyId)
    }

    /**新增菜单**/
    public async httpBaseAccountCreateMenu(body: MenuDto.CreateMenuDto): Promise<TbAccountMenu> {
        return this.menuRepository.manager.transaction(async manager => {
            await this.menuUtilsService.lockTree(manager)
            await this.menuUtilsService.findParentRequired(body.parentKeyId, manager)
            await this.menuUtilsService.findPermissionCodeAvailable(manager, body.permissionCode)
            await this.menuUtilsService.findMenuFieldsRequired(body)
            const menu = manager.create(TbAccountMenu, { ...body, parentKeyId: body.parentKeyId })
            return manager.save(menu)
        })
    }

    /**编辑菜单**/
    public async httpBaseAccountUpdateMenu(body: MenuDto.UpdateMenuPayloadDto): Promise<TbAccountMenu> {
        const { keyId, ...input } = body
        return this.menuRepository.manager.transaction(async manager => {
            await this.menuUtilsService.lockTree(manager)
            const menu = await this.menuUtilsService.findRequired(keyId, manager)

            const nextParentKeyId = input.parentKeyId === undefined ? menu.parentKeyId : (input.parentKeyId ?? null)
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('菜单不能成为自己的父节点')
            }
            await this.menuUtilsService.findParentRequired(nextParentKeyId, manager)
            if (isNotEmpty(input.permissionCode) && input.permissionCode !== menu.permissionCode) {
                await this.menuUtilsService.findPermissionCodeAvailable(manager, input.permissionCode, keyId)
            }
            await manager.merge(TbAccountMenu, menu, input, { parentKeyId: nextParentKeyId })
            await this.menuUtilsService.findMenuFieldsRequired(menu)
            await manager.save(menu)
            return await this.menuUtilsService.findAssertTree(manager).then(() => {
                return menu
            })
        })
    }

    /**删除菜单**/
    public async httpBaseAccountDeleteMenu(body: MenuDto.MenuKeyDto): Promise<SuccessResponseDataDto> {
        await this.menuRepository.manager.transaction(async manager => {
            await this.menuUtilsService.lockTree(manager)
            await this.menuUtilsService.findRequired(body.keyId, manager)
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
