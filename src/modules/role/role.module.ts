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
import { RoleController } from '@/modules/role/role.controller'
import { RoleService } from '@/modules/role/role.service'

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
    controllers: [RoleController],
    providers: [RoleService],
    exports: [RoleService]
})
export class RoleModule {}
