import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { EnumsResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { AccountUserSummaryResponseDto } from '@/modules/user/dto/user.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 创建组织节点入参：POST /dept/create。 */
export class CreateOrganizationDto extends PickType(Schema.TbAccountOrganizationDto, [
    'parentKeyId',
    'code',
    'name',
    'type',
    'leaderUserUid',
    'sort',
    'status'
] as const) {}

/** UpdateOrganizationPayloadDto 的基类；更新或移动组织节点入参：POST /dept/update。 */
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

/** 入参：GET /dept/column/user、GET /dept/resolve、POST /dept/delete（按组织主键获取该组织的直接启用成员；获取组织详情；删除没有下级、成员和权限引用的组织节点）。 */
export class OrganizationKeyDto {
    @ApiProperty({ description: '组织主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    keyId: number
}

/** 获取组织树；传入组织主键时只返回该组织的下级子树入参：GET /dept/tree/structure。 */
export class OrganizationTreeQueryDto {
    @ApiPropertyOptional({ description: '上级组织主键；传入后只返回该组织的下级子树', example: 1124100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    keyId?: number
}

/** 更新或移动组织节点入参：POST /dept/update。 */
export class UpdateOrganizationPayloadDto extends IntersectionType(OrganizationKeyDto, UpdateOrganizationDto) {}

/** 获取组织树；传入组织主键时只返回该组织的下级子树响应：GET /dept/tree/structure。 */
export class OrganizationTreeNodeResponseDto extends PickType(Schema.TbAccountOrganizationDto, [
    'keyId',
    'parentKeyId',
    'name',
    'type',
    'leaderUserUid',
    'sort'
] as const) {
    @ApiProperty({ description: '下级组织节点', type: () => OrganizationTreeNodeResponseDto, isArray: true, example: [] })
    children: OrganizationTreeNodeResponseDto[]
}

/** 按组织主键获取该组织的直接启用成员响应：GET /dept/column/user。 */
export class OrganizationUserResponseDto extends AccountUserSummaryResponseDto {
    @ApiProperty({ description: '是否为主组织', example: true })
    isPrimary: boolean

    @ApiProperty({ description: '用户在该组织中的岗位名称', required: false, example: '研发工程师' })
    postName?: string

    @ApiProperty({ description: '所属组织主键', example: 1 })
    organizationKeyId: number
}

/** 获取带启用成员的完整组织树响应：GET /dept/tree/user。 */
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

/** 获取组织类型和状态枚举响应：GET /dept/enums。 */
export class OrganizationEnumsResponseDto extends EnumsResponseDto({
    typeOptions: { description: '组织类型选项', example: Schema.TbAccountOrganizationTypeDefinition.options },
    statusOptions: { description: '组织状态选项', example: Schema.TbAccountOrganizationStatusDefinition.options }
}) {}

/** 按账号UID全集同步组织成员入参：POST /dept/update/user。 */
export class UpdateOrganizationUsersDto {
    @ApiProperty({ description: '组织主键', example: 1124100 })
    @Type(() => Number)
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    organizationKeyId: number

    @ApiProperty({ description: '该组织的目标成员账号 UID 全集；多出的新增，缺少的移除', type: [String], example: ['2281665656346656771'] })
    @IsArray({ message: '账号UID列表必须是数组' })
    @ArrayMaxSize(100, { message: '单次最多处理100个账号' })
    @ArrayUnique({ message: '账号UID不能重复' })
    @IsString({ each: true, message: '账号UID必须是字符串' })
    uids: string[]
}
