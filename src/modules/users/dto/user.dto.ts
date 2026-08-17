import { Type } from 'class-transformer'
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
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    MaxLength,
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
}

export class UserOrganizationMembershipDto {
    @ApiProperty({ description: '组织UID', example: '2149446185344106496' })
    @IsString({ message: '组织UID必须是字符串' })
    @IsNotEmpty({ message: '组织UID必填' })
    @Length(1, 19, { message: '组织UID长度不能超过19位' })
    organizationUid: string

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
    @ApiProperty({ description: '用户拥有的全部角色UID；空数组表示清空', type: [String] })
    @IsArray({ message: '角色UID列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色UID不能重复' })
    @IsString({ each: true, message: '角色UID必须是字符串' })
    @Length(1, 19, { each: true, message: '角色UID长度不能超过19位' })
    roleUids: string[]
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

    @ApiPropertyOptional({ description: '创建时一并设置的角色UID；仅超级管理员可用', type: [String] })
    @IsOptional()
    @IsArray({ message: '角色UID列表必须是数组' })
    @ArrayMaxSize(100, { message: '单个用户最多关联100个角色' })
    @ArrayUnique({ message: '角色UID不能重复' })
    @IsString({ each: true, message: '角色UID必须是字符串' })
    @Length(1, 19, { each: true, message: '角色UID长度不能超过19位' })
    roleUids?: string[]
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
    @Length(8, 128, { message: '新密码长度必须保持8-128位' })
    password: string
}
