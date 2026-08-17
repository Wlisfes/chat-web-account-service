import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger'
import {
    TbAccountRoleDataScopeStatus,
    TbAccountRoleDataScopeType,
    TbAccountRoleDto
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

export class CreateRoleDto extends PickType(TbAccountRoleDto, ['code', 'name', 'description', 'sort', 'status'] as const) {}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class ReplaceRoleMenusDto {
    @ApiProperty({ description: '角色拥有的全部菜单UID；空数组表示清空', type: [String] })
    @IsArray({ message: '菜单UID列表必须是数组' })
    @ArrayMaxSize(1000, { message: '单个角色最多关联1000个菜单' })
    @ArrayUnique({ message: '菜单UID不能重复' })
    @IsString({ each: true, message: '菜单UID必须是字符串' })
    @Length(1, 19, { each: true, message: '菜单UID长度不能超过19位' })
    menuUids: string[]
}

export class DataScopeOrganizationGrantDto {
    @ApiProperty({ description: '授权组织UID', example: '2149446185344106496' })
    @IsString({ message: '授权组织UID必须是字符串' })
    @IsNotEmpty({ message: '授权组织UID必填' })
    @Length(1, 19, { message: '授权组织UID长度不能超过19位' })
    organizationUid: string

    @ApiProperty({ description: '是否包含全部下级组织', example: true })
    @IsBoolean({ message: '包含下级标记必须是布尔值' })
    includeChildren: boolean
}

export class RoleDataScopeRuleDto {
    @ApiProperty({ description: '业务资源编码；星号表示默认规则', example: 'account:user' })
    @IsString({ message: '业务资源编码必须是字符串' })
    @IsNotEmpty({ message: '业务资源编码必填' })
    @MaxLength(128, { message: '业务资源编码长度不能超过128位' })
    resourceCode: string

    @ApiProperty({ enum: TbAccountRoleDataScopeType, enumName: 'TbAccountRoleDataScopeType' })
    @IsEnum(TbAccountRoleDataScopeType, { message: '数据范围类型格式错误' })
    scopeType: TbAccountRoleDataScopeType

    @ApiPropertyOptional({
        enum: TbAccountRoleDataScopeStatus,
        enumName: 'TbAccountRoleDataScopeStatus',
        default: TbAccountRoleDataScopeStatus.ENABLED
    })
    @IsOptional()
    @IsEnum(TbAccountRoleDataScopeStatus, { message: '数据范围规则状态格式错误' })
    status: TbAccountRoleDataScopeStatus = TbAccountRoleDataScopeStatus.ENABLED

    @ApiPropertyOptional({ description: 'scopeType=custom 时的自定义组织授权', type: [DataScopeOrganizationGrantDto] })
    @IsOptional()
    @IsArray({ message: '自定义组织授权必须是数组' })
    @ArrayMaxSize(1000, { message: '单条数据范围最多关联1000个组织' })
    @ValidateNested({ each: true })
    @Type(() => DataScopeOrganizationGrantDto)
    organizations?: DataScopeOrganizationGrantDto[]
}

export class ReplaceRoleDataScopesDto {
    @ApiProperty({ description: '角色的完整数据范围规则；空数组表示清空', type: [RoleDataScopeRuleDto] })
    @IsArray({ message: '数据范围规则必须是数组' })
    @ArrayMaxSize(100, { message: '单个角色最多配置100条数据范围规则' })
    @ValidateNested({ each: true })
    @Type(() => RoleDataScopeRuleDto)
    rules: RoleDataScopeRuleDto[]
}
