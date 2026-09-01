import { Body, Get, Post, Query } from '@nestjs/common'
import { CreateSheetDto, SheetColumnQueryDto, SheetKeyDto, UpdateSheetPayloadDto } from '@/modules/sheet/dto/sheet.dto'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SheetPageResponseDto, SheetTreeNodeResponseDto } from '@/dto/api-response.dto'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { SheetService } from '@/modules/sheet/sheet.service'

@ApifoxController('系统菜单', 'sheet', { bearerAuth: true })
export class SheetController {
    constructor(private readonly sheetService: SheetService) {}

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整菜单树' },
        response: { type: SheetTreeNodeResponseDto, isArray: true, description: '完整菜单树' }
    })
    public async httpBaseAccountSheetTree() {
        return this.sheetService.httpBaseAccountSheetTree()
    }

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '按父菜单分页查询一级及直接下级节点' },
        request: { source: 'body', type: SheetColumnQueryDto },
        response: { type: SheetPageResponseDto, description: '菜单分页数据' }
    })
    public async httpBaseAccountColumnSheet(@Body() body: SheetColumnQueryDto) {
        return this.sheetService.httpBaseAccountColumnSheet(body)
    }

    @RequirePermissions('account:menu:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取菜单详情' },
        request: { source: 'query', type: SheetKeyDto },
        response: { type: TbAccountMenuDto, description: '菜单详情' }
    })
    public async httpBaseAccountSheetResolver(@Query() query: SheetKeyDto) {
        return this.sheetService.httpBaseAccountSheetResolver(query)
    }

    @RequirePermissions('account:menu:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建目录、菜单或按钮节点' },
        request: { source: 'body', type: CreateSheetDto },
        response: { type: TbAccountMenuDto, description: '新增后的菜单节点' }
    })
    public async httpBaseAccountCreateSheet(@Body() input: CreateSheetDto) {
        return this.sheetService.httpBaseAccountCreateSheet(input)
    }

    @RequirePermissions('account:menu:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动菜单节点' },
        request: { source: 'body', type: UpdateSheetPayloadDto },
        response: { type: TbAccountMenuDto, description: '更新后的菜单节点' }
    })
    public async httpBaseAccountUpdateSheet(@Body() input: UpdateSheetPayloadDto) {
        return this.sheetService.httpBaseAccountUpdateSheet(input)
    }

    @RequirePermissions('account:menu:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级和角色引用的菜单节点' },
        request: { source: 'body', type: SheetKeyDto },
        response: { type: SuccessResponseDataDto, description: '菜单删除结果' }
    })
    public async httpBaseAccountDeleteSheet(@Body() input: SheetKeyDto) {
        return await this.sheetService.httpBaseAccountDeleteSheet(input)
    }
}
