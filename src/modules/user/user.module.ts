import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
    TbAccountOrganization,
    TbAccountRole,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserRole,
    TbAccountPosition,
    TbAccountUserPosition
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { AuthModule } from '@/modules/auth/auth.module'
import { UserController } from '@/modules/user/user.controller'
import { UserService } from '@/modules/user/user.service'
import { UserUtilsService } from '@/modules/user/user.utils.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TbAccountUser,
            TbAccountUserOrganization,
            TbAccountUserRole,
            TbAccountOrganization,
            TbAccountRole,
            TbAccountPosition,
            TbAccountUserPosition
        ]),
        AuthModule
    ],
    controllers: [UserController],
    providers: [UserService, UserUtilsService],
    exports: [UserService]
})
export class UserModule {}
