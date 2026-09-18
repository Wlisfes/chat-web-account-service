import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { AccountUserSummaryResponseDto } from '@/modules/user/dto/user.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

export class CreateDeptDto extends PickType(Schema.TbAccountOrganizationDto, [
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

export class DeptTreeNodeResponseDto extends Schema.TbAccountOrganizationDto {
    @ApiProperty({ description: '组织成员数量', example: 12 })
    memberCount: number

    @ApiProperty({ description: '组织负责人', type: AccountUserSummaryResponseDto, nullable: true, required: false })
    leader?: AccountUserSummaryResponseDto | null

    @ApiProperty({ description: '下级组织节点', type: () => DeptTreeNodeResponseDto, isArray: true, example: [] })
    children: DeptTreeNodeResponseDto[]
}
