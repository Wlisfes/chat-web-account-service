import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { SheetService } from '@/modules/sheet/sheet.service'
import * as SheetDto from '@/modules/sheet/dto/sheet.dto'

@ApifoxController('系统菜单', '/sheet', { bearerAuth: true })
export class SheetController {
    constructor(private readonly sheetService: SheetService) {}

    @RequirePermissions('chat:deploy:system:sheet')
    @ApiServiceDecorator(Get('/tree/structure'), {
        operation: { summary: '获取完整菜单树' },
        response: { type: SheetDto.SheetTreeNodeResponseDto, isArray: true, description: '完整菜单树' }
    })
    public async httpBaseAccountSheetTree() {
        return this.sheetService.httpBaseAccountSheetTree()
    }

    @RequirePermissions('chat:deploy:system:sheet')
    @ApiServiceDecorator(Post('/column'), {
        operation: { summary: '按父菜单分页查询一级及直接下级节点' },
        request: { source: 'body', type: SheetDto.SheetColumnQueryDto },
        response: { type: SheetDto.SheetPageResponseDto, description: '菜单分页数据' }
    })
    public async httpBaseAccountColumnSheet(@Body() body: SheetDto.SheetColumnQueryDto) {
        return this.sheetService.httpBaseAccountColumnSheet(body)
    }

    @RequirePermissions('chat:deploy:system:sheet')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取菜单详情' },
        request: { source: 'query', type: SheetDto.SheetKeyDto },
        response: { type: TbAccountMenuDto, description: '菜单详情' }
    })
    public async httpBaseAccountSheetResolver(@Query() query: SheetDto.SheetKeyDto) {
        return this.sheetService.httpBaseAccountSheetResolver(query)
    }

    @RequirePermissions('chat:deploy:system:sheet:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建目录、菜单或按钮节点' },
        request: { source: 'body', type: SheetDto.CreateSheetDto },
        response: { type: TbAccountMenuDto, description: '新增后的菜单节点' }
    })
    public async httpBaseAccountCreateSheet(@Body() input: SheetDto.CreateSheetDto) {
        return this.sheetService.httpBaseAccountCreateSheet(input)
    }

    @RequirePermissions('chat:deploy:system:sheet:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动菜单节点' },
        request: { source: 'body', type: SheetDto.UpdateSheetPayloadDto },
        response: { type: TbAccountMenuDto, description: '更新后的菜单节点' }
    })
    public async httpBaseAccountUpdateSheet(@Body() input: SheetDto.UpdateSheetPayloadDto) {
        return this.sheetService.httpBaseAccountUpdateSheet(input)
    }

    @RequirePermissions('chat:deploy:system:sheet:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级和角色引用的菜单节点' },
        request: { source: 'body', type: SheetDto.SheetKeyDto },
        response: { type: SuccessResponseDataDto, description: '菜单删除结果' }
    })
    public async httpBaseAccountDeleteSheet(@Body() input: SheetDto.SheetKeyDto) {
        return await this.sheetService.httpBaseAccountDeleteSheet(input)
    }
}
