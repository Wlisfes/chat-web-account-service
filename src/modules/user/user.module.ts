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
import { PasswordService } from '@wlisfes/chat-web-base-schema/auth'
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
        ])
    ],
    controllers: [UserController],
    providers: [UserService, UserUtilsService, PasswordService],
    exports: [UserService]
})
export class UserModule {}
