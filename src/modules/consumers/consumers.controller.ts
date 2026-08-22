import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ConsumersService } from '@/modules/consumers/consumers.service'
import { CreateConsumerDto, ListConsumerDto, UpdateConsumerDto, UpdateConsumerStatusDto } from '@/modules/consumers/dto/consumer.dto'

@ApiTags('账号中心-外部客户')
@ApiBearerAuth('authorization')
@Controller('consumers')
export class ConsumersController {
    constructor(private readonly service: ConsumersService) {}

    @Post('create')
    create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateConsumerDto) {
        return this.service.create(principal.uid, input)
    }

    @Post('update')
    update(@Body() input: UpdateConsumerDto) {
        return this.service.update(input)
    }

    @Post('column')
    list(@Body() input: ListConsumerDto) {
        return this.service.list(input)
    }

    @Post('update/status')
    updateStatus(@Body() input: UpdateConsumerStatusDto) {
        return this.service.updateStatus(input)
    }
}
