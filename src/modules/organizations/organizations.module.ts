import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountRoleDataScopeOrganization,
    TbAccountUser,
    TbAccountUserOrganization
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { OrganizationsController } from '@/modules/organizations/organizations.controller'
import { OrganizationsService } from '@/modules/organizations/organizations.service'

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
    controllers: [OrganizationsController],
    providers: [OrganizationsService],
    exports: [OrganizationsService]
})
export class OrganizationsModule {}
