import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountMenu,
    TbAccountOrganizationClosure,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUserOrganization,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PermissionGuard } from '@/modules/permissions/permission.guard'
import { PermissionsController } from '@/modules/permissions/permissions.controller'
import { PermissionsService } from '@/modules/permissions/permissions.service'

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbAccountRole,
            TbAccountUserRole,
            TbAccountMenu,
            TbAccountRoleMenu,
            TbAccountRoleDataScope,
            TbAccountRoleDataScopeOrganization,
            TbAccountUserOrganization,
            TbAccountOrganizationClosure
        ])
    ],
    controllers: [PermissionsController],
    providers: [PermissionsService, PermissionGuard],
    exports: [PermissionsService, PermissionGuard]
})
export class PermissionsModule {}
