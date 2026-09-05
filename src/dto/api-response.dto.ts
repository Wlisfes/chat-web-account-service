import { ApiProperty, OmitType, PickType } from '@nestjs/swagger'
import { PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import {
    TbAccountConsumerDto,
    TbAccountMenuDto,
    TbAccountOrganizationDto,
    TbAccountPositionDto,
    TbAccountRoleDataScopeDto,
    TbAccountRoleDataScopeOrganizationDto,
    TbAccountRoleDto,
    TbAccountUserDto,
    TbAccountUserOrganizationDto,
    TbAccountUserOrganizationStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

export class ServiceLivenessResponseDto {
    @ApiProperty({ description: '服务状态', enum: ['UP'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string
}

export class ServiceDependencyResponseDto {
    @ApiProperty({ description: '依赖是否连接成功', example: true })
    connected: boolean

    @ApiProperty({ description: '必需数据表数量', required: false, example: 11 })
    requiredTableCount?: number

    @ApiProperty({ description: '缺失的数据表', type: [String], required: false, example: [] })
    missingTables?: string[]

    @ApiProperty({ description: '检查失败原因', required: false, example: '连接超时' })
    error?: string
}

export class ServiceSecurityResponseDto {
    @ApiProperty({ description: '鉴权服务内部认证配置是否完整', example: true })
    authConfigured: boolean
}

export class ServiceReadinessResponseDto {
    @ApiProperty({ description: '服务就绪状态', enum: ['UP', 'DOWN'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string

    @ApiProperty({ description: '数据库状态', type: ServiceDependencyResponseDto })
    database: ServiceDependencyResponseDto

    @ApiProperty({ description: '安全配置状态', type: ServiceSecurityResponseDto })
    security: ServiceSecurityResponseDto
}

export class AccountUserResponseDto extends OmitType(TbAccountUserDto, ['password'] as const) {}

export class AccountUserSummaryResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class SheetTreeNodeResponseDto extends TbAccountMenuDto {
    @ApiProperty({ description: '下级菜单节点', type: () => SheetTreeNodeResponseDto, isArray: true, example: [] })
    children: SheetTreeNodeResponseDto[]
}

export class SheetPageResponseDto extends PageResponseDataDto {
    @ApiProperty({
        description: '菜单平铺分页数据；parentKeyId 为空返回一级节点，否则将指定节点排在第一条并返回其直接下级节点',
        type: [TbAccountMenuDto]
    })
    list: TbAccountMenuDto[]
}

export class DeptTreeNodeResponseDto extends TbAccountOrganizationDto {
    @ApiProperty({ description: '组织成员数量', example: 12 })
    memberCount: number

    @ApiProperty({ description: '组织负责人', type: AccountUserSummaryResponseDto, nullable: true, required: false })
    leader?: AccountUserSummaryResponseDto | null

    @ApiProperty({ description: '下级组织节点', type: () => DeptTreeNodeResponseDto, isArray: true, example: [] })
    children: DeptTreeNodeResponseDto[]
}

export class RoleDataScopeOrganizationResponseDto extends TbAccountRoleDataScopeOrganizationDto {}

export class RoleDataScopeResponseDto extends TbAccountRoleDataScopeDto {
    @ApiProperty({ description: '自定义数据范围组织', type: [RoleDataScopeOrganizationResponseDto] })
    organizations: RoleDataScopeOrganizationResponseDto[]
}

export class RoleResponseDto extends TbAccountRoleDto {
    @ApiProperty({ description: '角色拥有的菜单主键', type: [Number], required: false, example: [1, 2, 3] })
    menuKeyIds?: number[]

    @ApiProperty({ description: '角色数据范围规则', type: [RoleDataScopeResponseDto] })
    dataScopes: RoleDataScopeResponseDto[]
}

export class EffectiveAccessResponseDto {
    @ApiProperty({ description: '是否为超级管理员', example: false })
    superAdmin: boolean

    @ApiProperty({ description: '有效角色编码', type: [String], example: ['sales_manager'] })
    roleCodes: string[]

    @ApiProperty({ description: '有效权限编码', type: [String], example: ['account:consumer:list'] })
    permissionCodes: string[]

    @ApiProperty({ description: '当前账号可访问的菜单树', type: [SheetTreeNodeResponseDto] })
    menuTree: SheetTreeNodeResponseDto[]
}

export class EffectiveDataScopeResponseDto {
    @ApiProperty({ description: '是否拥有全部数据权限', example: false })
    all: boolean

    @ApiProperty({ description: '是否包含本人数据', example: true })
    includeSelf: boolean

    @ApiProperty({ description: '可访问的组织主键', type: [Number], example: [1, 2, 3] })
    organizationKeyIds: number[]
}

export class ConsumerDepartmentOptionResponseDto {
    @ApiProperty({ description: '组织主键', example: 1 })
    keyId: number

    @ApiProperty({ description: '组织名称', example: '华东销售部' })
    name: string

    @ApiProperty({ description: '兼容前端使用的部门名称', example: '华东销售部' })
    deptName: string
}

export class ConsumerResponseDto extends TbAccountConsumerDto {
    @ApiProperty({ description: '兼容前端使用的业务员 UID', example: '2149446185344106496' })
    userId: string

    @ApiProperty({ description: '兼容前端使用的品牌主键', example: 1 })
    brandId: number

    @ApiProperty({ description: '归属业务员信息', type: AccountUserSummaryResponseDto })
    accountOptions: AccountUserSummaryResponseDto

    @ApiProperty({ description: '归属业务员的组织列表', type: [ConsumerDepartmentOptionResponseDto] })
    deptOptions: ConsumerDepartmentOptionResponseDto[]

    @ApiProperty({ description: '客户标签', type: [String], example: [] })
    tags: string[]
}

export class ConsumerPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '客户列表', type: [ConsumerResponseDto] })
    list: ConsumerResponseDto[]
}

export class ConsumerSelectResponseDto extends PickType(TbAccountConsumerDto, [
    'keyId',
    'uid',
    'ownerUserUid',
    'name',
    'alias',
    'currency',
    'email',
    'phone',
    'status'
] as const) {
    @ApiProperty({ description: '兼容前端使用的品牌主键', example: 1 })
    brandId: number
}

export class PositionResponseDto extends TbAccountPositionDto {
    @ApiProperty({ description: '关联员工数量', example: 12 })
    accountCount: number
}

export class PositionPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '职位列表', type: [PositionResponseDto] })
    list: PositionResponseDto[]
}

export class PositionSelectResponseDto extends PickType(TbAccountPositionDto, ['keyId', 'name'] as const) {}

export class UserOrganizationResponseDto extends TbAccountOrganizationDto {
    @ApiProperty({ description: '是否为主组织', example: true })
    isPrimary: boolean

    @ApiProperty({ description: '岗位名称', required: false, example: '客户经理' })
    positionName?: string

    @ApiProperty({
        description: '用户组织关系状态',
        enum: TbAccountUserOrganizationStatus,
        example: TbAccountUserOrganizationStatus.ENABLED
    })
    membershipStatus: TbAccountUserOrganizationStatus
}

export class UserDetailResponseDto extends AccountUserResponseDto {
    @ApiProperty({ description: '账号组织关系', type: [TbAccountUserOrganizationDto] })
    memberships: TbAccountUserOrganizationDto[]

    @ApiProperty({ description: '账号所属组织', type: [UserOrganizationResponseDto] })
    organizations: UserOrganizationResponseDto[]

    @ApiProperty({ description: '账号角色主键', type: [Number], example: [1, 2] })
    roleKeyIds: number[]

    @ApiProperty({ description: '账号角色', type: [TbAccountRoleDto] })
    roles: TbAccountRoleDto[]

    @ApiProperty({ description: '账号职位主键', type: [Number], example: [1, 2] })
    positionKeyIds: number[]

    @ApiProperty({ description: '账号职位', type: [PositionSelectResponseDto] })
    positions: PositionSelectResponseDto[]
}

export class UserPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '账号列表', type: [UserDetailResponseDto] })
    list: UserDetailResponseDto[]
}
