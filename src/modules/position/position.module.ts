import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ACCOUNT_MYSQL_ENTITIES } from '@/database/database.constants'
import { PositionController } from '@/modules/position/position.controller'
import { PositionUtilsService } from '@/modules/position/position.utils.service'
import { PositionService } from '@/modules/position/position.service'

@Module({
    imports: [TypeOrmModule.forFeature(ACCOUNT_MYSQL_ENTITIES)],
    controllers: [PositionController],
    providers: [PositionService, PositionUtilsService],
    exports: [PositionService]
})
export class PositionModule {}
