import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountMenu, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { MenusController } from '@/modules/menus/menus.controller'
import { MenusService } from '@/modules/menus/menus.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountMenu, TbAccountRoleMenu])],
    controllers: [MenusController],
    providers: [MenusService],
    exports: [MenusService]
})
export class MenusModule {}
