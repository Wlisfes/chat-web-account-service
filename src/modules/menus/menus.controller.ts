import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermissions } from '@/modules/auth/auth.decorator'
import { CreateMenuDto, UpdateMenuDto } from '@/modules/menus/dto/menu.dto'
import { MenusService } from '@/modules/menus/menus.service'

@ApiTags('系统菜单')
@ApiBearerAuth('authorization')
@Controller('menus')
export class MenusController {
    constructor(private readonly menusService: MenusService) {}

    @Get('tree')
    @RequirePermissions('account:menu:list')
    @ApiOperation({ summary: '获取完整菜单树' })
    getTree() {
        return this.menusService.getTree()
    }

    @Get(':uid')
    @RequirePermissions('account:menu:list')
    @ApiOperation({ summary: '获取菜单详情' })
    findOne(@Param('uid') uid: string) {
        return this.menusService.findOne(uid)
    }

    @Post()
    @RequirePermissions('account:menu:create')
    @ApiOperation({ summary: '创建目录、菜单或按钮节点' })
    create(@Body() input: CreateMenuDto) {
        return this.menusService.create(input)
    }

    @Patch(':uid')
    @RequirePermissions('account:menu:update')
    @ApiOperation({ summary: '更新或移动菜单节点' })
    update(@Param('uid') uid: string, @Body() input: UpdateMenuDto) {
        return this.menusService.update(uid, input)
    }

    @Delete(':uid')
    @RequirePermissions('account:menu:delete')
    @ApiOperation({ summary: '删除没有下级和角色引用的菜单节点' })
    async remove(@Param('uid') uid: string) {
        await this.menusService.remove(uid)
        return { success: true }
    }
}
