import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { ConsumerService } from '@/modules/consumer/consumer.service'
import { CreateConsumerDto, ListConsumerDto, UpdateConsumerDto, UpdateConsumerStatusDto } from '@/modules/consumer/dto/consumer.dto'

@ApiTags('账号中心-外部客户')
@ApiBearerAuth('authorization')
@Controller('consumer')
export class ConsumerController {
    constructor(private readonly service: ConsumerService) {}

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
