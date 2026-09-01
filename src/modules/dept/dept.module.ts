import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountRoleDataScopeOrganization,
    TbAccountUser,
    TbAccountUserOrganization
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DeptController } from '@/modules/dept/dept.controller'
import { DeptService } from '@/modules/dept/dept.service'
import { DeptUtilsService } from '@/modules/dept/dept.utils.service'

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
    controllers: [DeptController],
    providers: [DeptService, DeptUtilsService],
    exports: [DeptService]
})
export class DeptModule {}
