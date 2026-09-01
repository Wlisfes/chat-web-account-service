import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'

export class CreateDeptDto extends PickType(TbAccountOrganizationDto, [
    'parentKeyId',
    'code',
    'name',
    'type',
    'leaderUserUid',
    'sort',
    'status'
] as const) {}

export class UpdateDeptDto extends PartialType(CreateDeptDto) {}

export class DeptKeyDto {
    @ApiProperty({ description: '组织主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    keyId: number
}

export class UpdateDeptPayloadDto extends IntersectionType(DeptKeyDto, UpdateDeptDto) {}
