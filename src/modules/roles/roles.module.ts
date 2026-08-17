import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountMenu,
    TbAccountOrganization,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { RolesController } from '@/modules/roles/roles.controller'
import { RolesService } from '@/modules/roles/roles.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbAccountRole,
            TbAccountMenu,
            TbAccountRoleMenu,
            TbAccountUserRole,
            TbAccountRoleDataScope,
            TbAccountRoleDataScopeOrganization,
            TbAccountOrganization
        ])
    ],
    controllers: [RolesController],
    providers: [RolesService],
    exports: [RolesService]
})
export class RolesModule {}
