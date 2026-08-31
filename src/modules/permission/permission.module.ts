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
import { PermissionGuard } from '@/modules/permission/permission.guard'
import { PermissionController } from '@/modules/permission/permission.controller'
import { PermissionService } from '@/modules/permission/permission.service'
import { PermissionUtilsService } from '@/modules/permission/permission.utils.service'

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
    controllers: [PermissionController],
    providers: [PermissionService, PermissionUtilsService, PermissionGuard],
    exports: [PermissionService, PermissionGuard]
})
export class PermissionModule {}
