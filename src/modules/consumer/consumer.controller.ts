import { Body, Get, Post, Query } from '@nestjs/common'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController } from '@wlisfes/chat-web-base-schema/decorator'
import { ConsumerService } from '@/modules/consumer/consumer.service'
import {
    CreateConsumerDto,
    ListConsumerDto,
    ResolveConsumerDto,
    SelectConsumerDto,
    UpdateConsumerDto,
    UpdateConsumerStatusDto
} from '@/modules/consumer/dto/consumer.dto'
import { ConsumerPageResponseDto, ConsumerResponseDto, ConsumerSelectResponseDto } from '@/dto/api-response.dto'

@ApifoxController('账号中心-外部客户', 'consumer', { bearerAuth: true })
export class ConsumerController {
    constructor(private readonly consumerService: ConsumerService) {}

    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '新增外部客户' },
        request: { source: 'body', type: CreateConsumerDto },
        response: { type: ConsumerResponseDto, description: '新增后的客户信息' }
    })
    httpBaseAccountCreateConsumer(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateConsumerDto) {
        return this.consumerService.create(principal.uid, input)
    }

    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新外部客户' },
        request: { source: 'body', type: UpdateConsumerDto },
        response: { type: ConsumerResponseDto, description: '更新后的客户信息' }
    })
    httpBaseAccountUpdateConsumer(@Body() input: UpdateConsumerDto) {
        return this.consumerService.update(input)
    }

    @ApiServiceDecorator(Post('column'), {
        operation: { summary: '分页查询外部客户' },
        request: { source: 'body', type: ListConsumerDto },
        response: { type: ConsumerPageResponseDto, description: '客户分页数据' }
    })
    httpBaseAccountColumnConsumer(@Body() input: ListConsumerDto) {
        return this.consumerService.list(input)
    }

    @ApiServiceDecorator(Post('update/status'), {
        operation: { summary: '更新外部客户状态' },
        request: { source: 'body', type: UpdateConsumerStatusDto },
        response: { type: ConsumerResponseDto, description: '更新后的客户信息' }
    })
    httpBaseAccountUpdateConsumerStatus(@Body() input: UpdateConsumerStatusDto) {
        return this.consumerService.updateStatus(input)
    }

    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取外部客户详情' },
        request: { source: 'query', type: ResolveConsumerDto },
        response: { type: ConsumerResponseDto, description: '客户详情' }
    })
    httpBaseAccountResolverConsumer(@Query() input: ResolveConsumerDto) {
        return this.consumerService.resolve(input.keyId)
    }

    @ApiServiceDecorator(Get('select'), {
        operation: { summary: '获取外部客户下拉选项' },
        request: { source: 'query', type: SelectConsumerDto },
        response: { type: ConsumerSelectResponseDto, isArray: true, description: '客户下拉选项' }
    })
    httpBaseAccountSelectConsumer(@Query() input: SelectConsumerDto) {
        return this.consumerService.select(input)
    }
}
