import { ApiProperty, ApiPropertyOptional, IntersectionType, OmitType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator'
import { EnumsResponseDto, PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
import { PositionSelectResponseDto } from '@/modules/position/dto/position.dto'
import * as Schema from '@wlisfes/chat-web-base-schema'

class PositionKeyIdsDto {
    @ApiPropertyOptional({ description: '职位主键数组', type: [Number], example: [1, 2] })
    @IsOptional()
    @IsArray({ message: '职位主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个账号最多关联100个职位' })
    @ArrayUnique({ message: '职位主键不能重复' })
    @IsInt({ each: true, message: '职位主键必须是整数' })
    @Min(1, { each: true, message: '职位主键必须大于0' })
    positionKeyIds?: number[]
}

export class UserQueryDto extends IntersectionType(PageDto, PositionKeyIdsDto) {
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
    positionName?: string

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

export class ReplaceUserOrganizationsDto {
    @ApiProperty({
        description: '用户的完整组织关系；空数组表示清空',
        type: [UserOrganizationMembershipDto],
        example: [{ organizationKeyId: 1, isPrimary: true, positionName: '研发工程师', status: 'enabled' }]
    })
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships: UserOrganizationMembershipDto[]
}

export class ReplaceUserRolesDto {
    @ApiProperty({ description: '用户拥有的全部角色主键；空数组表示清空', type: [Number], example: [1, 2] })
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds: number[]
}

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
    PositionKeyIdsDto
) {
    @ApiPropertyOptional({
        description: '创建时一并设置的组织关系',
        type: [UserOrganizationMembershipDto],
        example: [{ organizationKeyId: 1, isPrimary: true, positionName: '客户经理', status: 'enabled' }]
    })
    @IsOptional()
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships?: UserOrganizationMembershipDto[]

    @ApiPropertyOptional({ description: '创建时一并设置的角色主键；仅超级管理员可用', type: [Number], example: [2] })
    @IsOptional()
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds?: number[]
}

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
    PositionKeyIdsDto
) {}

export class ResetUserPasswordDto {
    @ApiProperty({ description: '新密码', example: 'NewPassword2026', writeOnly: true })
    @IsString({ message: '新密码必须是字符串' })
    @IsNotEmpty({ message: '新密码必填' })
    @Length(6, 32, { message: '新密码长度必须保持6-32位' })
    password: string
}

export class UserUidDto {
    @ApiProperty({ description: '账号 UID', example: '2026082200000000001' })
    @IsString({ message: '账号UID必须是字符串' })
    @Matches(/^\d{1,19}$/, { message: '账号UID必须是1-19位数字字符串' })
    uid: string
}

export class UpdateUserPayloadDto extends IntersectionType(UserUidDto, UpdateUserDto) {}

export class ResetUserPasswordPayloadDto extends IntersectionType(UserUidDto, ResetUserPasswordDto) {}

export class ReplaceUserOrganizationsPayloadDto extends IntersectionType(UserUidDto, ReplaceUserOrganizationsDto) {}

export class ReplaceUserRolesPayloadDto extends IntersectionType(UserUidDto, ReplaceUserRolesDto) {}

export class AccountUserResponseDto extends OmitType(Schema.TbAccountUserDto, ['password'] as const) {}

export class AccountUserSelectResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class AccountUserSummaryResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class UserOrganizationResponseDto extends Schema.TbAccountOrganizationDto {
    @ApiProperty({ description: '是否为主组织', example: true })
    isPrimary: boolean

    @ApiProperty({ description: '岗位名称', required: false, example: '客户经理' })
    positionName?: string

    @ApiProperty({
        description: '用户组织关系状态',
        enum: Schema.TbAccountUserOrganizationStatus,
        example: Schema.TbAccountUserOrganizationStatus.ENABLED
    })
    membershipStatus: Schema.TbAccountUserOrganizationStatus
}

export class UserDetailResponseDto extends AccountUserResponseDto {
    @ApiProperty({ description: '账号组织关系', type: [Schema.TbAccountUserOrganizationDto] })
    memberships: Schema.TbAccountUserOrganizationDto[]

    @ApiProperty({ description: '账号所属组织', type: [UserOrganizationResponseDto] })
    organizations: UserOrganizationResponseDto[]

    @ApiProperty({ description: '账号角色主键', type: [Number], example: [1, 2] })
    roleKeyIds: number[]

    @ApiProperty({ description: '账号角色', type: [Schema.TbAccountRoleDto] })
    roles: Schema.TbAccountRoleDto[]

    @ApiProperty({ description: '账号职位主键', type: [Number], example: [1, 2] })
    positionKeyIds: number[]

    @ApiProperty({ description: '账号职位', type: [PositionSelectResponseDto] })
    positions: PositionSelectResponseDto[]
}

export class UserPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '账号列表', type: [UserDetailResponseDto] })
    list: UserDetailResponseDto[]
}

export class UserEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '账号状态选项', example: Schema.TbAccountUserStatusDefinition.options },
    employmentStatusOptions: { description: '员工状态选项', example: Schema.TbAccountUserEmploymentStatusDefinition.options },
    membershipStatusOptions: { description: '用户组织关系状态选项', example: Schema.TbAccountUserOrganizationStatusDefinition.options }
}) {}
