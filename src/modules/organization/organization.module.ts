import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountRoleDataScopeOrganization,
    TbAccountUser,
    TbAccountUserOrganization
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { OrganizationController } from '@/modules/organization/organization.controller'
import { OrganizationService } from '@/modules/organization/organization.service'
import { OrganizationUtilsService } from '@/modules/organization/organization.utils.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbAccountOrganization,
            TbAccountOrganizationClosure,
            TbAccountUserOrganization,
            TbAccountRoleDataScopeOrganization,
            TbAccountUser
        ])
    ],
    controllers: [OrganizationController],
    providers: [OrganizationService, OrganizationUtilsService],
    exports: [OrganizationService]
})
export class OrganizationModule {}
