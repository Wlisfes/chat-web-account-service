import { Body, Get, Post, Query } from '@nestjs/common'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { CreateMenuDto, MenuColumnQueryDto, MenuKeyDto, UpdateMenuPayloadDto } from '@/modules/menu/dto/menu.dto'
import { MenuService } from '@/modules/menu/menu.service'
import { MenuPageResponseDto, MenuTreeNodeResponseDto } from '@/dto/api-response.dto'

@ApifoxController('系统菜单', 'menu', { bearerAuth: true })
export class MenuController {
    constructor(private readonly menuService: MenuService) {}

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整菜单树' },
        response: { type: MenuTreeNodeResponseDto, isArray: true, description: '完整菜单树' }
    })
    httpBaseAccountMenuTree() {
        return this.menuService.getTree()
    }

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '按父菜单分页查询直接下级节点' },
        request: { source: 'body', type: MenuColumnQueryDto },
        response: { type: MenuPageResponseDto, description: '菜单分页数据' }
    })
    httpBaseAccountColumnMenu(@Body() input: MenuColumnQueryDto) {
        return this.menuService.findPage(input)
    }

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取菜单详情' },
        request: { source: 'query', type: MenuKeyDto },
        response: { type: TbAccountMenuDto, description: '菜单详情' }
    })
    httpBaseAccountMenuResolver(@Query() query: MenuKeyDto) {
        return this.menuService.findOne(query.keyId)
    }

    @RequirePermissions('account:menu:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建目录、菜单或按钮节点' },
        request: { source: 'body', type: CreateMenuDto },
        response: { type: TbAccountMenuDto, description: '新增后的菜单节点' }
    })
    httpBaseAccountCreateMenu(@Body() input: CreateMenuDto) {
        return this.menuService.create(input)
    }

    @RequirePermissions('account:menu:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动菜单节点' },
        request: { source: 'body', type: UpdateMenuPayloadDto },
        response: { type: TbAccountMenuDto, description: '更新后的菜单节点' }
    })
    httpBaseAccountUpdateMenu(@Body() input: UpdateMenuPayloadDto) {
        const { keyId, ...payload } = input
        return this.menuService.update(keyId, payload)
    }

    @RequirePermissions('account:menu:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级和角色引用的菜单节点' },
        request: { source: 'body', type: MenuKeyDto },
        response: { type: SuccessResponseDataDto, description: '菜单删除结果' }
    })
    async httpBaseAccountDeleteMenu(@Body() input: MenuKeyDto) {
        await this.menuService.remove(input.keyId)
        return { success: true }
    }
}
