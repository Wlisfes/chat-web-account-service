import { Transform, Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger'
import {
    TbAccountUserDto,
    TbAccountUserOrganizationStatus,
    TbAccountUserStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
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
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator'
import { PageDto } from '@/common/dto/page.dto'

export class UserQueryDto extends PageDto {
    @ApiPropertyOptional({ description: '按工号、姓名、手机号或邮箱模糊查询' })
    @IsOptional()
    @IsString({ message: '查询关键词必须是字符串' })
    @MaxLength(128, { message: '查询关键词长度不能超过128位' })
    keyword?: string

    @ApiPropertyOptional({ enum: TbAccountUserStatus, enumName: 'TbAccountUserStatus' })
    @IsOptional()
    @IsEnum(TbAccountUserStatus, { message: '账号状态格式错误' })
    status?: TbAccountUserStatus

    @ApiPropertyOptional({ description: '按组织主键筛选，多个主键使用英文逗号分隔', type: [Number] })
    @IsOptional()
    @Transform(({ value }) => {
        const values = Array.isArray(value) ? value : String(value).split(',')
        return values.filter(item => String(item).trim()).map(item => Number(item))
    })
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
        enum: TbAccountUserOrganizationStatus,
        enumName: 'TbAccountUserOrganizationStatus',
        default: TbAccountUserOrganizationStatus.ENABLED
    })
    @IsOptional()
    @IsEnum(TbAccountUserOrganizationStatus, { message: '用户组织关系状态格式错误' })
    status: TbAccountUserOrganizationStatus = TbAccountUserOrganizationStatus.ENABLED
}

export class ReplaceUserOrganizationsDto {
    @ApiProperty({ description: '用户的完整组织关系；空数组表示清空', type: [UserOrganizationMembershipDto] })
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships: UserOrganizationMembershipDto[]
}

export class ReplaceUserRolesDto {
    @ApiProperty({ description: '用户拥有的全部角色主键；空数组表示清空', type: [Number] })
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds: number[]
}

export class CreateUserDto extends PickType(TbAccountUserDto, [
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
] as const) {
    @ApiPropertyOptional({ description: '创建时一并设置的组织关系', type: [UserOrganizationMembershipDto] })
    @IsOptional()
    @IsArray({ message: '组织关系列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个组织' })
    @ValidateNested({ each: true })
    @Type(() => UserOrganizationMembershipDto)
    memberships?: UserOrganizationMembershipDto[]

    @ApiPropertyOptional({ description: '创建时一并设置的角色主键；仅超级管理员可用', type: [Number] })
    @IsOptional()
    @IsArray({ message: '角色主键列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色主键不能重复' })
    @IsInt({ each: true, message: '角色主键必须是整数' })
    @Min(1, { each: true, message: '角色主键必须大于0' })
    roleKeyIds?: number[]
}

export class UpdateUserDto extends PartialType(
    PickType(TbAccountUserDto, [
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
) {}

export class ResetUserPasswordDto {
    @ApiProperty({ description: '新密码', example: 'NewPassword2026', writeOnly: true })
    @IsString({ message: '新密码必须是字符串' })
    @IsNotEmpty({ message: '新密码必填' })
    @Length(6, 32, { message: '新密码长度必须保持6-32位' })
    password: string
}
