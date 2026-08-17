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
import { UsersController } from '@/modules/users/users.controller'
import { UsersService } from '@/modules/users/users.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([TbAccountUser, TbAccountUserOrganization, TbAccountUserRole, TbAccountOrganization, TbAccountRole]),
        AuthModule
    ],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService]
})
export class UsersModule {}
