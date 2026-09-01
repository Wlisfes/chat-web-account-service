import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TbAccountMenu, TbAccountRoleMenu } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SheetController } from '@/modules/sheet/sheet.controller'
import { SheetService } from '@/modules/sheet/sheet.service'
import { SheetUtilsService } from '@/modules/sheet/sheet.utils.service'

@Module({
    imports: [TypeOrmModule.forFeature([TbAccountMenu, TbAccountRoleMenu])],
    controllers: [SheetController],
    providers: [SheetService, SheetUtilsService],
    exports: [SheetService]
})
export class SheetModule {}
