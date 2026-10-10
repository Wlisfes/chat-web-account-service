import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { EnumsResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested
} from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema'

/** ReplaceRoleSheetsPayloadDto 的基类；替换角色的全部菜单和按钮权限入参：POST /role/update/sheet。 */
export class ReplaceRoleSheetsDto {
    @ApiProperty({ description: '角色拥有的全部菜单主键；空数组表示清空', type: [Number], example: [1, 2, 3] })
    @IsArray({ message: '菜单主键列表必须是数组' })
    @ArrayMaxSize(1000, { message: '单个角色最多关联1000个菜单' })
    @ArrayUnique({ message: '菜单主键不能重复' })
    @IsInt({ each: true, message: '菜单主键必须是整数' })
    @Min(1, { each: true, message: '菜单主键必须大于0' })
    sheetKeyIds: number[]
}

/** RoleDataScopeRuleDto.organizations 字段结构；创建角色入参：POST /role/create。 */
export class DataScopeOrganizationGrantDto {
    @ApiProperty({ description: '授权组织主键', example: 1 })
    @IsInt({ message: '授权组织主键必须是整数' })
    @Min(1, { message: '授权组织主键必须大于0' })
    organizationKeyId: number

    @ApiProperty({ description: '是否包含全部下级组织', example: true })
    @IsBoolean({ message: '包含下级标记必须是布尔值' })
    includeChildren: boolean
}

/** RoleDataScopesDto.dataScopes 字段结构；创建角色入参：POST /role/create。 */
export class RoleDataScopeRuleDto {
    @ApiProperty({ description: '业务资源编码；星号表示默认规则', example: 'chat:account:user' })
    @IsString({ message: '业务资源编码必须是字符串' })
    @IsNotEmpty({ message: '业务资源编码必填' })
    @MaxLength(128, { message: '业务资源编码长度不能超过128位' })
    resourceCode: string

    @ApiProperty({
        description: '数据范围类型',
        enum: Schema.TbAccountRoleDataScopeType,
        enumName: 'TbAccountRoleDataScopeType',
        example: Schema.TbAccountRoleDataScopeType.CUSTOM
    })
    @IsEnum(Schema.TbAccountRoleDataScopeType, { message: '数据范围类型格式错误' })
    scopeType: Schema.TbAccountRoleDataScopeType

    @ApiPropertyOptional({
        description: '数据范围规则状态',
        enum: Schema.TbAccountRoleDataScopeStatus,
        enumName: 'TbAccountRoleDataScopeStatus',
        default: Schema.TbAccountRoleDataScopeStatus.ENABLED,
        example: Schema.TbAccountRoleDataScopeStatus.ENABLED
    })
    @IsOptional()
    @IsEnum(Schema.TbAccountRoleDataScopeStatus, { message: '数据范围规则状态格式错误' })
    status: Schema.TbAccountRoleDataScopeStatus = Schema.TbAccountRoleDataScopeStatus.ENABLED

    @ApiPropertyOptional({
        description: 'scopeType=custom 时的自定义组织授权',
        type: [DataScopeOrganizationGrantDto],
        example: [{ organizationKeyId: 1, includeChildren: true }]
    })
    @IsOptional()
    @IsArray({ message: '自定义组织授权必须是数组' })
    @ArrayMaxSize(1000, { message: '单条数据范围最多关联1000个组织' })
    @ValidateNested({ each: true })
    @Type(() => DataScopeOrganizationGrantDto)
    organizations?: DataScopeOrganizationGrantDto[]
}

/** CreateRoleDto 的基类；创建角色入参：POST /role/create。 */
export class RoleDataScopesDto {
    @ApiProperty({
        description: '角色的完整数据范围规则；空数组表示清空',
        type: [RoleDataScopeRuleDto],
        example: [
            {
                resourceCode: '*',
                scopeType: 'custom',
                status: 'enabled',
                organizations: [{ organizationKeyId: 1, includeChildren: true }]
            }
        ]
    })
    @IsArray({ message: '数据范围规则必须是数组' })
    @ArrayMaxSize(100, { message: '单个角色最多配置100条数据范围规则' })
    @ValidateNested({ each: true })
    @Type(() => RoleDataScopeRuleDto)
    dataScopes: RoleDataScopeRuleDto[]
}

/** 创建角色入参：POST /role/create。 */
export class CreateRoleDto extends IntersectionType(
    PickType(Schema.TbAccountRoleDto, ['code', 'name', 'description', 'sort', 'status'] as const),
    RoleDataScopesDto
) {}

/** UpdateRolePayloadDto 的基类；更新角色入参：POST /role/update。 */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

/** 入参：GET /role/resolve、POST /role/delete（获取角色、菜单和数据范围详情；删除未分配用户的非内置角色）。 */
export class RoleKeyDto {
    @ApiProperty({ description: '角色主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '角色主键必须是整数' })
    @Min(1, { message: '角色主键必须大于0' })
    keyId: number
}

/** 入参：POST /role/link/user、POST /role/unlink/user（批量关联角色用户；批量移除角色用户）。 */
export class RoleUserPayloadDto extends RoleKeyDto {
    @ApiProperty({ description: '账号UID列表', type: [String], example: ['2281665656346656771'] })
    @IsArray({ message: '账号UID列表必须是数组' })
    @ArrayMaxSize(1000, { message: '单次最多处理1000个账号' })
    @ArrayUnique({ message: '账号UID不能重复' })
    @IsString({ each: true, message: '账号UID必须是字符串' })
    @IsNotEmpty({ each: true, message: '账号UID不能为空' })
    uids: string[]
}

/** 更新角色入参：POST /role/update。 */
export class UpdateRolePayloadDto extends IntersectionType(RoleKeyDto, UpdateRoleDto) {}

/** UpdateRoleSortPayloadDto.list 字段结构；批量更新角色排序入参：POST /role/sort/update。 */
export class RoleSortItemDto extends PickType(Schema.TbAccountRoleDto, ['keyId', 'sort'] as const) {}

/** 批量更新角色排序入参：POST /role/sort/update。 */
export class UpdateRoleSortPayloadDto {
    @ApiProperty({ description: '角色排序列表', type: [RoleSortItemDto], example: [{ keyId: 1, sort: 10 }] })
    @IsArray({ message: '角色排序列表必须是数组' })
    @ArrayNotEmpty({ message: '角色排序列表不能为空' })
    @ArrayMaxSize(1000, { message: '单次最多排序1000个角色' })
    @ValidateNested({ each: true })
    @Type(() => RoleSortItemDto)
    list: RoleSortItemDto[]
}

/** 替换角色的全部菜单和按钮权限入参：POST /role/update/sheet。 */
export class ReplaceRoleSheetsPayloadDto extends IntersectionType(RoleKeyDto, ReplaceRoleSheetsDto) {}

/** RoleDataScopeResponseDto.organizations 字段结构；获取角色、菜单和数据范围详情响应：GET /role/resolve。 */
export class RoleDataScopeOrganizationResponseDto extends Schema.TbAccountRoleDataScopeOrganizationDto {}

/** RoleResponseDto.dataScopes 字段结构；获取角色、菜单和数据范围详情响应：GET /role/resolve。 */
export class RoleDataScopeResponseDto extends Schema.TbAccountRoleDataScopeDto {
    @ApiProperty({ description: '自定义数据范围组织', type: [RoleDataScopeOrganizationResponseDto] })
    organizations: RoleDataScopeOrganizationResponseDto[]
}

/** 获取角色、菜单和数据范围详情响应：GET /role/resolve。 */
export class RoleResponseDto extends Schema.TbAccountRoleDto {
    @ApiProperty({ description: '角色拥有的菜单主键', type: [Number], required: false, example: [1, 2, 3] })
    sheetKeyIds?: number[]

    @ApiProperty({ description: '角色数据范围规则', type: [RoleDataScopeResponseDto] })
    dataScopes: RoleDataScopeResponseDto[]
}

/** RoleConfigerResponseDto.tree 字段结构；获取通用角色列表和岗位角色树响应：GET /role/configer。 */
export class RoleConfigerTreeNodeResponseDto extends PickType(Schema.TbAccountOrganizationDto, [
    'keyId',
    'parentKeyId',
    'name',
    'type',
    'sort'
] as const) {
    @ApiProperty({ description: '树节点主键；有岗位角色时为角色主键，否则为组织主键的负数', example: 1 })
    nodeId: number

    @ApiProperty({ description: '组织绑定的岗位角色', type: RoleResponseDto, required: false })
    node?: RoleResponseDto

    @ApiProperty({ description: '是否禁用选择；组织未绑定岗位角色时为 true', example: false })
    disabled: boolean

    @ApiProperty({ description: '下级岗位角色节点', type: () => RoleConfigerTreeNodeResponseDto, isArray: true, example: [] })
    children: RoleConfigerTreeNodeResponseDto[]
}

/** 获取通用角色列表和岗位角色树响应：GET /role/configer。 */
export class RoleConfigerResponseDto {
    @ApiProperty({ description: '通用角色列表', type: [RoleResponseDto] })
    list: RoleResponseDto[]

    @ApiProperty({ description: '岗位角色树', type: [RoleConfigerTreeNodeResponseDto] })
    tree: RoleConfigerTreeNodeResponseDto[]
}

/** 获取角色状态和数据范围枚举响应：GET /role/enums。 */
export class RoleEnumsResponseDto extends EnumsResponseDto({
    statusOptions: { description: '角色状态选项', example: Schema.TbAccountRoleStatusDefinition.options },
    scopeTypeOptions: { description: '数据范围类型选项', example: Schema.TbAccountRoleDataScopeTypeDefinition.options },
    scopeStatusOptions: { description: '数据范围规则状态选项', example: Schema.TbAccountRoleDataScopeStatusDefinition.options }
}) {}
