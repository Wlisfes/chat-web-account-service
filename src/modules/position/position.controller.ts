import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { PositionService } from '@/modules/position/position.service'
import * as PositionDto from '@/modules/position/dto/position.dto'

@ApifoxController('系统职位', 'position', { bearerAuth: true })
export class PositionController {
    constructor(private readonly positionService: PositionService) {}

    @RequirePermissions('account:position:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增职位' },
        request: { source: 'body', type: PositionDto.CreatePositionDto },
        response: { type: PositionDto.PositionResponseDto, description: '新增后的职位' }
    })
    public async httpBaseAccountCreatePosition(@Body() input: PositionDto.CreatePositionDto) {
        return this.positionService.httpBaseAccountCreatePosition(input)
    }

    @RequirePermissions('account:position:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '编辑职位' },
        request: { source: 'body', type: PositionDto.UpdatePositionDto },
        response: { type: PositionDto.PositionResponseDto, description: '更新后的职位' }
    })
    public async httpBaseAccountUpdatePosition(@Body() input: PositionDto.UpdatePositionDto) {
        return this.positionService.httpBaseAccountUpdatePosition(input)
    }

    @RequirePermissions('account:position:list')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取职位详情' },
        request: { source: 'query', type: PositionDto.PositionKeyDto },
        response: { type: PositionDto.PositionResponseDto, description: '职位详情' }
    })
    public async httpBaseAccountPositionResolver(@Query() query: PositionDto.PositionKeyDto) {
        return this.positionService.httpBaseAccountPositionResolver(query)
    }

    @RequirePermissions('account:position:list')
    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询职位' },
        request: { source: 'body', type: PositionDto.ListPositionDto },
        response: { type: PositionDto.PositionPageResponseDto, description: '职位分页数据' }
    })
    public async httpBaseAccountColumnPosition(@Body() input: PositionDto.ListPositionDto) {
        return this.positionService.httpBaseAccountColumnPosition(input)
    }

    @RequirePermissions('account:position:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除未关联员工的职位' },
        request: { source: 'body', type: PositionDto.PositionKeyDto },
        response: { type: SuccessResponseDataDto }
    })
    public async httpBaseAccountDeletePosition(@Body() input: PositionDto.PositionKeyDto) {
        return this.positionService.httpBaseAccountDeletePosition(input)
    }

    @RequirePermissions('account:position:list')
    @ApiServiceDecorator(Get('select'), {
        operation: { summary: '获取职位下拉选项' },
        request: { source: 'query', type: PositionDto.SelectPositionDto },
        response: { type: PositionDto.PositionSelectResponseDto, isArray: true, description: '职位下拉选项' }
    })
    public async httpBaseAccountSelectPosition(@Query() query: PositionDto.SelectPositionDto) {
        return this.positionService.httpBaseAccountSelectPosition(query)
    }
}
