import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountRole,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { AuthModule } from '@/modules/auth/auth.module'
import { UserController } from '@/modules/user/user.controller'
import { UserService } from '@/modules/user/user.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([TbAccountUser, TbAccountUserOrganization, TbAccountUserRole, TbAccountOrganization, TbAccountRole]),
        AuthModule
    ],
    controllers: [UserController],
    providers: [UserService],
    exports: [UserService]
})
export class UserModule {}
