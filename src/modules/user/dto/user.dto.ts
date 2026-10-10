import { ApiProperty, ApiPropertyOptional, IntersectionType, OmitType, PartialType, PickType } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty } from 'class-validator'
import { IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateNested } from 'class-validator'
import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
import { Type } from 'class-transformer'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** 账号枚举展示数据，来源于 Skyline 枚举（岗位 CHUNK_SYSTEM_ACCOUNT_USER_POST、职级 CHUNK_SYSTEM_ACCOUNT_USER_LEVEL）。 */
export class UserChunkResponseDto {
    @ApiProperty({ description: '枚举主键（Skyline 枚举值）', example: 1024100 })
    keyId: number

    @ApiProperty({ description: '枚举名称', example: '外贸业务员' })
    name: string
}

class PostKeyIdsDto {
    @ApiPropertyOptional({ description: '岗位主键数组（Skyline 岗位枚举值）', type: [Number], example: [1024100, 1024101] })
    @IsOptional()
    @IsArray({ message: '岗位主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个账号最多关联100个岗位' })
    @ArrayUnique({ message: '岗位主键不能重复' })
    @IsInt({ each: true, message: '岗位主键必须是整数' })
    @Min(1, { each: true, message: '岗位主键必须大于0' })
    postKeyIds?: number[]

    @ApiPropertyOptional({ description: '职级主键数组（Skyline 职级枚举值）', type: [Number], example: [1024170] })
    @IsOptional()
    @IsArray({ message: '职级主键列表必须是数组' })
    @ArrayMaxSize(16, { message: '单个账号最多关联16个职级' })
    @ArrayUnique({ message: '职级主键不能重复' })
    @IsInt({ each: true, message: '职级主键必须是整数' })
    @Min(1, { each: true, message: '职级主键必须大于0' })
    levelKeyIds?: number[]
}

/** 分页查询账号入参：POST /user/column。 */
export class UserQueryDto extends IntersectionType(PageDto, PostKeyIdsDto) {
    @ApiPropertyOptional({ description: '按工号、姓名、手机号或邮箱模糊查询', example: '张三' })
    @IsOptional()
    @IsString({ message: '查询关键词必须是字符串' })
    @MaxLength(128, { message: '查询关键词长度不能超过128位' })
    vague?: string

    @ApiPropertyOptional({
        description: '账号状态',
        enum: Schema.TbAccountUserStatus,
        enumName: 'TbAccountUserStatus',
        example: Schema.TbAccountUserStatus.ENABLED
    })
    @IsOptional()
    @IsEnum(Schema.TbAccountUserStatus, { message: '账号状态格式错误' })
    status?: Schema.TbAccountUserStatus

    @ApiPropertyOptional({ description: '按组织主键数组筛选', type: [Number], example: [1, 2] })
    @IsOptional()
    @IsArray({ message: '组织主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单次最多筛选100个组织' })
    @ArrayUnique({ message: '组织主键不能重复' })
    @IsInt({ each: true, message: '组织主键必须是整数' })
    @Min(1, { each: true, message: '组织主键必须大于0' })
    organizationKeyIds?: number[]

    @ApiPropertyOptional({ description: '按角色主键筛选', example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '角色主键必须是整数' })
    @Min(1, { message: '角色主键必须大于0' })
    roleKeyId?: number
}

/** ReplaceUserOrganizationsDto.memberships 字段结构；替换账号的主组织和兼任组织入参：POST /user/update/organization。 */
export class UserOrganizationMembershipDto {
    @ApiProperty({ description: '组织主键', example: 1 })
    @IsInt({ message: '组织主键必须是整数' })
    @Min(1, { message: '组织主键必须大于0' })
    organizationKeyId: number

    @ApiProperty({ description: '是否为主组织', example: true })
    @IsBoolean({ message: '主组织标记必须是布尔值' })
    isPrimary: boolean

    @ApiPropertyOptional({ description: '用户在该组织中的岗位名称', example: '研发工程师' })
    @IsOptional()
    @IsString({ message: '岗位名称必须是字符串' })
    @MaxLength(64, { message: '岗位名称长度不能超过64位' })
    postName?: string

    @ApiPropertyOptional({
        description: '用户组织关系状态',
        enum: Schema.TbAccountUserOrganizationStatus,
        enumName: 'TbAccountUserOrganizationStatus',
        default: Schema.TbAccountUserOrganizationStatus.ENABLED,
        example: Schema.TbAccountUserOrganizationStatus.ENABLED
    })
    @IsOptional()
    @IsEnum(Schema.TbAccountUserOrganizationStatus, { message: '用户组织关系状态格式错误' })
    status: Schema.TbAccountUserOrganizationStatus = Schema.TbAccountUserOrganizationStatus.ENABLED
}

/** ReplaceUserOrganizationsPayloadDto 的基类；替换账号的主组织和兼任组织入参：POST /user/update/organization。 */
export class ReplaceUserOrganizationsDto {
    @ApiPropertyOptional({
        description: '用户的完整组织关系；空数组表示清空',
        type: [UserOrganizationMembershipDto],
        example: [{ organizationKeyId: 1, isPrimary: true, postName: '研发工程师', status: 'enabled' }]
    })
    @IsOptional()
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships?: UserOrganizationMembershipDto[]

    @ApiPropertyOptional({ description: '账号组织主键', type: [Number], example: [1, 2] })
    @IsOptional()
    @IsArray({ message: '组织主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ArrayUnique({ message: '组织主键不能重复' })
    @IsInt({ each: true, message: '组织主键必须是整数' })
    @Min(1, { each: true, message: '组织主键必须大于0' })
    organizationKeyIds?: number[]
}

/** ReplaceUserRolesPayloadDto 的基类；替换账号的全部角色入参：POST /user/update/role。 */
export class ReplaceUserRolesDto {
    @ApiProperty({ description: '用户拥有的全部角色主键；空数组表示清空', type: [Number], example: [1, 2] })
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds: number[]
}

/** 创建账号并可原子设置组织和角色入参：POST /user/create。 */
export class CreateUserDto extends IntersectionType(
    PickType(Schema.TbAccountUserDto, [
        'number',
        'phone',
        'email',
        'name',
        'avatar',
        'status',
        'employmentStatus',
        'password',
        'employmentTime',
        'resignationTime'
    ] as const),
    PostKeyIdsDto
) {
    @ApiPropertyOptional({
        description: '创建时一并设置的组织关系',
        type: [UserOrganizationMembershipDto],
        example: [{ organizationKeyId: 1, isPrimary: true, postName: '客户经理', status: 'enabled' }]
    })
    @IsOptional()
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships?: UserOrganizationMembershipDto[]

    @ApiPropertyOptional({ description: '账号组织主键', type: [Number], example: [1, 2] })
    @IsOptional()
    @IsArray({ message: '组织主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ArrayUnique({ message: '组织主键不能重复' })
    @IsInt({ each: true, message: '组织主键必须是整数' })
    @Min(1, { each: true, message: '组织主键必须大于0' })
    organizationKeyIds?: number[]

    @ApiPropertyOptional({ description: '创建时一并设置的角色主键；仅超级管理员可用', type: [Number], example: [2] })
    @IsOptional()
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds?: number[]
}

/** UpdateUserPayloadDto 的基类；更新账号资料和状态入参：POST /user/update。 */
export class UpdateUserDto extends IntersectionType(
    PartialType(
        PickType(Schema.TbAccountUserDto, [
            'number',
            'phone',
            'email',
            'name',
            'avatar',
            'status',
            'employmentStatus',
            'employmentTime',
            'resignationTime'
        ] as const)
    ),
    PostKeyIdsDto
) {}

/** ResetUserPasswordPayloadDto 的基类；超级管理员重置账号密码入参：POST /user/reset/password。 */
export class ResetUserPasswordDto {
    @ApiProperty({ description: '新密码', example: 'NewPassword2026', writeOnly: true })
    @IsString({ message: '新密码必须是字符串' })
    @IsNotEmpty({ message: '新密码必填' })
    @Length(6, 32, { message: '新密码长度必须保持6-32位' })
    password: string
}

/** 获取账号详情入参：GET /user/resolve。 */
export class UserUidDto {
    @ApiProperty({ description: '账号 UID', example: '2026082200000000001' })
    @IsString({ message: '账号UID必须是字符串' })
    @Matches(/^\d{1,19}$/, { message: '账号UID必须是1-19位数字字符串' })
    uid: string
}

/** 更新账号资料和状态入参：POST /user/update。 */
export class UpdateUserPayloadDto extends IntersectionType(UserUidDto, UpdateUserDto) {}

/** 超级管理员重置账号密码入参：POST /user/reset/password。 */
export class ResetUserPasswordPayloadDto extends IntersectionType(UserUidDto, ResetUserPasswordDto) {}

/** 替换账号的主组织和兼任组织入参：POST /user/update/organization。 */
export class ReplaceUserOrganizationsPayloadDto extends IntersectionType(UserUidDto, ReplaceUserOrganizationsDto) {}

/** 替换账号的全部角色入参：POST /user/update/role。 */
export class ReplaceUserRolesPayloadDto extends IntersectionType(UserUidDto, ReplaceUserRolesDto) {}

/** 响应：POST /user/create、POST /user/update（创建账号并可原子设置组织和角色；更新账号资料和状态）。 */
export class AccountUserResponseDto extends OmitType(Schema.TbAccountUserDto, ['password'] as const) {}

/** 获取账号下拉选项响应：GET /user/select。 */
export class AccountUserSelectResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

/** OrganizationUserResponseDto 的基类；按组织主键获取该组织的直接启用成员响应：GET /dept/column/user。 */
export class AccountUserSummaryResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

/** UserDetailResponseDto.organizations 字段结构；获取账号详情响应：GET /user/resolve。 */
export class UserOrganizationResponseDto extends Schema.TbAccountOrganizationDto {
    @ApiProperty({ description: '是否为主组织', example: true })
    isPrimary: boolean

    @ApiProperty({ description: '岗位名称', required: false, example: '客户经理' })
    postName?: string

    @ApiProperty({
        description: '用户组织关系状态',
        enum: Schema.TbAccountUserOrganizationStatus,
        example: Schema.TbAccountUserOrganizationStatus.ENABLED
    })
    membershipStatus: Schema.TbAccountUserOrganizationStatus
}

/** 获取账号详情响应：GET /user/resolve。 */
export class UserDetailResponseDto extends AccountUserResponseDto {
    @ApiProperty({ description: '账号组织关系', type: [Schema.TbAccountUserOrganizationDto] })
    memberships: Schema.TbAccountUserOrganizationDto[]

    @ApiProperty({ description: '账号组织主键', type: [Number], example: [1, 2] })
    organizationKeyIds: number[]

    @ApiProperty({ description: '账号所属组织', type: [UserOrganizationResponseDto] })
    organizations: UserOrganizationResponseDto[]

    @ApiProperty({ description: '账号角色主键', type: [Number], example: [1, 2] })
    roleKeyIds: number[]

    @ApiProperty({ description: '账号角色', type: [Schema.TbAccountRoleDto] })
    roles: Schema.TbAccountRoleDto[]

    @ApiProperty({ description: '账号岗位主键（Skyline 岗位枚举值）', type: [Number], example: [1024100, 1024101] })
    postKeyIds: number[]

    @ApiProperty({ description: '账号岗位', type: [UserChunkResponseDto] })
    posts: UserChunkResponseDto[]

    @ApiProperty({ description: '账号职级主键（Skyline 职级枚举值）', type: [Number], example: [1024170] })
    levelKeyIds: number[]

    @ApiProperty({ description: '账号职级', type: [UserChunkResponseDto] })
    levels: UserChunkResponseDto[]
}

/** UserColumnResponseDto.organizations 字段结构；分页查询账号响应：POST /user/column。 */
export class UserColumnOrganizationResponseDto extends PickType(Schema.TbAccountOrganizationDto, ['keyId', 'name', 'code'] as const) {}

/** UserColumnResponseDto.roles 字段结构；分页查询账号响应：POST /user/column。 */
export class UserColumnRoleResponseDto extends PickType(Schema.TbAccountRoleDto, ['keyId', 'name', 'code'] as const) {}

/** UserPageResponseDto.list 字段结构；分页查询账号响应：POST /user/column。 */
export class UserColumnResponseDto extends OmitType(UserDetailResponseDto, ['memberships', 'organizations', 'roles'] as const) {
    @ApiProperty({ description: '账号所属组织', type: [UserColumnOrganizationResponseDto] })
    organizations: UserColumnOrganizationResponseDto[]

    @ApiProperty({ description: '账号角色', type: [UserColumnRoleResponseDto] })
    roles: UserColumnRoleResponseDto[]
}

/** 分页查询账号响应：POST /user/column。 */
export class UserPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '账号列表', type: [UserColumnResponseDto] })
    list: UserColumnResponseDto[]
}

/** 获取账号状态、员工状态和组织关系状态枚举响应：GET /user/enums。 */
export class UserEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '账号状态选项', example: Schema.TbAccountUserStatusDefinition.options },
    employmentStatusOptions: { description: '员工状态选项', example: Schema.TbAccountUserEmploymentStatusDefinition.options },
    membershipStatusOptions: { description: '用户组织关系状态选项', example: Schema.TbAccountUserOrganizationStatusDefinition.options }
}) {}
