import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PasswordService } from '@wlisfes/chat-web-base-schema/auth'
import { FeignClientSkylineManager, FeignModule } from '@wlisfes/chat-web-base-schema/feign'
import { ACCOUNT_MYSQL_ENTITIES } from '@/database/database.constants'
import { UserController } from '@/modules/user/user.controller'
import { UserUtilsService } from '@/modules/user/user.utils.service'
import { UserService } from '@/modules/user/user.service'

@Module({
    imports: [TypeOrmModule.forFeature(ACCOUNT_MYSQL_ENTITIES), FeignModule.register([FeignClientSkylineManager])],
    controllers: [UserController],
    providers: [UserService, UserUtilsService, PasswordService],
    exports: [UserService]
})
export class UserModule {}
