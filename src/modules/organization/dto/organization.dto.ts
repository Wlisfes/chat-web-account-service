import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { EnumsResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsString, Min } from 'class-validator'
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

export class OrganizationUserNodeResponseDto extends PickType(Schema.TbAccountOrganizationDto, [
    'keyId',
    'parentKeyId',
    'name',
    'type',
    'leaderUserUid',
    'sort'
] as const) {
    @ApiProperty({ description: '组织及下级启用成员数量', example: 12 })
    memberCount: number

    @ApiProperty({ description: '组织启用成员', type: [OrganizationUserResponseDto], example: [] })
    members: OrganizationUserResponseDto[]

    @ApiProperty({ description: '下级组织节点', type: () => OrganizationUserNodeResponseDto, isArray: true, example: [] })
    children: OrganizationUserNodeResponseDto[]
}

export class OrganizationEnumsResponseDto extends EnumsResponseDto({
    typeOptions: { description: '组织类型选项', example: Schema.TbAccountOrganizationTypeDefinition.options },
    statusOptions: { description: '组织状态选项', example: Schema.TbAccountOrganizationStatusDefinition.options }
}) {}

export class UpdateOrganizationUsersDto {
    @ApiProperty({ description: '组织主键', example: 1124100 })
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    organizationKeyId: number

    @ApiProperty({ description: '要加入该组织的账号 UID', type: [String], example: ['2281665656346656771'] })
    @IsArray({ message: '账号UID列表必须是数组' })
    @ArrayMinSize(1, { message: '至少选择一个账号' })
    @ArrayMaxSize(100, { message: '单次最多加入100个账号' })
    @ArrayUnique({ message: '账号UID不能重复' })
    @IsString({ each: true, message: '账号UID必须是字符串' })
    uids: string[]
}
