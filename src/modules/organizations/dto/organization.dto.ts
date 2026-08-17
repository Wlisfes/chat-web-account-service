import { PartialType, PickType } from '@nestjs/swagger'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

export class CreateOrganizationDto extends PickType(TbAccountOrganizationDto, [
    'parentUid',
    'code',
    'name',
    'type',
    'leaderUserUid',
    'sort',
    'status'
] as const) {}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
