import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { CreateMenuDto, MenuKeyDto, UpdateMenuPayloadDto } from '@/modules/menu/dto/menu.dto'
import { MenuService } from '@/modules/menu/menu.service'

@ApiTags('系统菜单')
@ApiBearerAuth('authorization')
@Controller('menu')
export class MenuController {
    constructor(private readonly menuService: MenuService) {}

    @Get('tree/structure')
    @RequirePermissions('account:menu:list')
    @ApiOperation({ summary: '获取完整菜单树' })
    httpBaseAccountMenuTree() {
        return this.menuService.getTree()
    }

    @Get('resolver')
    @RequirePermissions('account:menu:list')
    @ApiOperation({ summary: '获取菜单详情' })
    httpBaseAccountMenuResolver(@Query() query: MenuKeyDto) {
        return this.menuService.findOne(query.keyId)
    }

    @Post('create')
    @RequirePermissions('account:menu:create')
    @ApiOperation({ summary: '创建目录、菜单或按钮节点' })
    httpBaseAccountCreateMenu(@Body() input: CreateMenuDto) {
        return this.menuService.create(input)
    }

    @Post('update')
    @RequirePermissions('account:menu:update')
    @ApiOperation({ summary: '更新或移动菜单节点' })
    httpBaseAccountUpdateMenu(@Body() input: UpdateMenuPayloadDto) {
        const { keyId, ...payload } = input
        return this.menuService.update(keyId, payload)
    }

    @Post('delete')
    @RequirePermissions('account:menu:delete')
    @ApiOperation({ summary: '删除没有下级和角色引用的菜单节点' })
    async httpBaseAccountDeleteMenu(@Body() input: MenuKeyDto) {
        await this.menuService.remove(input.keyId)
        return { success: true }
    }
}
