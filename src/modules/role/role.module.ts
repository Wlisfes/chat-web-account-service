import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ACCOUNT_MYSQL_ENTITIES } from '@/database/database.constants'
import { RoleController } from '@/modules/role/role.controller'
import { RoleUtilsService } from '@/modules/role/role.utils.service'
import { RoleService } from '@/modules/role/role.service'

@Module({
    imports: [TypeOrmModule.forFeature(ACCOUNT_MYSQL_ENTITIES)],
    controllers: [RoleController],
    providers: [RoleService, RoleUtilsService],
    exports: [RoleService]
})
export class RoleModule {}
