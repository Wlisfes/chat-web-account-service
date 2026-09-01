import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountPosition, TbAccountUserOrganization, TbAccountUserPosition } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PositionController } from '@/modules/position/position.controller'
import { PositionService } from '@/modules/position/position.service'
import { PositionUtilsService } from '@/modules/position/position.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountPosition, TbAccountUserOrganization, TbAccountUserPosition])],
    controllers: [PositionController],
    providers: [PositionService, PositionUtilsService],
    exports: [PositionService]
})
export class PositionModule {}
