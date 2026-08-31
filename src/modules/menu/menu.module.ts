import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountMenu, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { MenuController } from '@/modules/menu/menu.controller'
import { MenuService } from '@/modules/menu/menu.service'
import { MenuUtilsService } from '@/modules/menu/menu.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountMenu, TbAccountRoleMenu])],
    controllers: [MenuController],
    providers: [MenuService, MenuUtilsService],
    exports: [MenuService]
})
export class MenuModule {}
