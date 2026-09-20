import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { AccountUserSummaryResponseDto } from '@/modules/user/dto/user.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

export class CreateOrganizationDto extends PickType(Schema.TbAccountOrganizationDto, [
    'parentKeyId',
    'code',
    'name',
    'type',
    'leaderUserUid',
    'sort',
    'status'
] as const) {}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class OrganizationKeyDto {
    @ApiProperty({ description: '组织主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    keyId: number
}

export class UpdateOrganizationPayloadDto extends IntersectionType(OrganizationKeyDto, UpdateOrganizationDto) {}

export class OrganizationTreeNodeResponseDto extends Schema.TbAccountOrganizationDto {
    @ApiProperty({ description: '组织及下级启用成员数量', example: 12 })
    memberCount: number

    @ApiProperty({ description: '组织负责人', type: AccountUserSummaryResponseDto, nullable: true, required: false })
    leader?: AccountUserSummaryResponseDto | null

    @ApiProperty({ description: '下级组织节点', type: () => OrganizationTreeNodeResponseDto, isArray: true, example: [] })
    children: OrganizationTreeNodeResponseDto[]
}

export class OrganizationUserResponseDto extends AccountUserSummaryResponseDto {
    @ApiProperty({ description: '是否为主组织', example: true })
    isPrimary: boolean

    @ApiProperty({ description: '用户在该组织中的岗位名称', required: false, example: '研发工程师' })
    positionName?: string

    @ApiProperty({ description: '所属组织主键', example: 1 })
    organizationKeyId: number
}

export class OrganizationUserNodeResponseDto extends OrganizationTreeNodeResponseDto {
    @ApiProperty({ description: '组织启用成员', type: [OrganizationUserResponseDto], example: [] })
    members: OrganizationUserResponseDto[]

    @ApiProperty({ description: '下级组织节点', type: () => OrganizationUserNodeResponseDto, isArray: true, example: [] })
    declare children: OrganizationUserNodeResponseDto[]
}
