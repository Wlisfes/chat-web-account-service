import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountConsumer } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { ConsumersController } from '@/modules/consumers/consumers.controller'
import { ConsumersService } from '@/modules/consumers/consumers.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountConsumer])],
    controllers: [ConsumersController],
    providers: [ConsumersService]
})
export class ConsumersModule {}
