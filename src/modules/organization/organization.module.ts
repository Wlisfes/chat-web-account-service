import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ACCOUNT_MYSQL_ENTITIES } from '@/database/database.constants'
import { OrganizationController } from '@/modules/organization/organization.controller'
import { OrganizationUtilsService } from '@/modules/organization/organization.utils.service'
import { OrganizationService } from '@/modules/organization/organization.service'

@Module({
    imports: [TypeOrmModule.forFeature(ACCOUNT_MYSQL_ENTITIES)],
    controllers: [OrganizationController],
    providers: [OrganizationService, OrganizationUtilsService],
    exports: [OrganizationService]
})
export class OrganizationModule {}
