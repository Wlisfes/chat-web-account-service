import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountConsumer } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { ConsumerController } from '@/modules/consumer/consumer.controller'
import { ConsumerService } from '@/modules/consumer/consumer.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountConsumer])],
    controllers: [ConsumerController],
    providers: [ConsumerService]
})
export class ConsumerModule {}
