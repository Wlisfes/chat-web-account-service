import { PartialType, PickType } from '@nestjs/swagger'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

export class CreateMenuDto extends PickType(TbAccountMenuDto, [
    'parentUid',
    'type',
    'name',
    'routeName',
    'path',
    'component',
    'permissionCode',
    'icon',
    'externalUrl',
    'sort',
    'visible',
    'keepAlive',
    'status'
] as const) {}

export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
