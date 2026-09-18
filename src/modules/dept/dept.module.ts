import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ACCOUNT_MYSQL_ENTITIES } from '@/database/database.constants'
import { DeptController } from '@/modules/dept/dept.controller'
import { DeptUtilsService } from '@/modules/dept/dept.utils.service'
import { DeptService } from '@/modules/dept/dept.service'

@Module({
    imports: [TypeOrmModule.forFeature(ACCOUNT_MYSQL_ENTITIES)],
    controllers: [DeptController],
    providers: [DeptService, DeptUtilsService],
    exports: [DeptService]
})
export class DeptModule {}
