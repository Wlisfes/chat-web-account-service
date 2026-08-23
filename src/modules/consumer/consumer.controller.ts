import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ConsumerService } from '@/modules/consumer/consumer.service'
import {
    CreateConsumerDto,
    ListConsumerDto,
    ResolveConsumerDto,
    SelectConsumerDto,
    UpdateConsumerDto,
    UpdateConsumerStatusDto
} from '@/modules/consumer/dto/consumer.dto'

@ApiTags('账号中心-外部客户')
@ApiBearerAuth('authorization')
@Controller('consumer')
export class ConsumerController {
    constructor(private readonly consumerService: ConsumerService) {}

    @Post('create')
    httpBaseAccountCreateConsumer(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateConsumerDto) {
        return this.consumerService.create(principal.uid, input)
    }

    @Post('update')
    httpBaseAccountUpdateConsumer(@Body() input: UpdateConsumerDto) {
        return this.consumerService.update(input)
    }

    @Post('column')
    httpBaseAccountColumnConsumer(@Body() input: ListConsumerDto) {
        return this.consumerService.list(input)
    }

    @Post('update/status')
    httpBaseAccountUpdateConsumerStatus(@Body() input: UpdateConsumerStatusDto) {
        return this.consumerService.updateStatus(input)
    }

    @Get('resolver')
    httpBaseAccountResolverConsumer(@Query() input: ResolveConsumerDto) {
        return this.consumerService.resolve(input.keyId)
    }

    @Get('select')
    httpBaseAccountSelectConsumer(@Query() input: SelectConsumerDto) {
        return this.consumerService.select(input)
    }
}
