import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'

export class CreateMenuDto extends PickType(TbAccountMenuDto, [
    'parentKeyId',
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

export class MenuKeyDto {
    @ApiProperty({ description: '菜单主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '菜单主键必须是整数' })
    @Min(1, { message: '菜单主键必须大于0' })
    keyId: number
}

export class UpdateMenuPayloadDto extends IntersectionType(MenuKeyDto, UpdateMenuDto) {}
