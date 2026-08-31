import { ApiProperty, OmitType, PickType } from '@nestjs/swagger'
import { PageResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import {
    TbAccountConsumerDto,
    TbAccountMenuDto,
    TbAccountOrganizationDto,
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
    @ApiProperty({ description: 'JWT 密钥是否已正确配置', example: true })
    jwtConfigured: boolean
}

export class ServiceReadinessResponseDto {
    @ApiProperty({ description: '服务就绪状态', enum: ['UP', 'DOWN'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string

    @ApiProperty({ description: '数据库状态', type: ServiceDependencyResponseDto })
    database: ServiceDependencyResponseDto

    @ApiProperty({ description: 'Redis 状态', type: ServiceDependencyResponseDto })
    redis: ServiceDependencyResponseDto

    @ApiProperty({ description: '安全配置状态', type: ServiceSecurityResponseDto })
    security: ServiceSecurityResponseDto
}

export class LoginUserResponseDto extends PickType(TbAccountUserDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class AccessTokenResponseDto {
    @ApiProperty({ description: 'Bearer 访问令牌', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    accessToken: string

    @ApiProperty({ description: '令牌类型', enum: ['Bearer'], example: 'Bearer' })
    tokenType: string

    @ApiProperty({ description: '有效期，单位为秒', example: 36000 })
    expiresIn: number
}

export class LoginResponseDto extends AccessTokenResponseDto {
    @ApiProperty({ description: '当前登录账号', type: LoginUserResponseDto })
    user: LoginUserResponseDto
}

export class AuthPrincipalResponseDto {
    @ApiProperty({ description: '账号 UID', example: '2149446185344106496' })
    uid: string

    @ApiProperty({ description: '登录会话 ID', format: 'uuid', example: 'a56b8b36-1d86-4cf2-9c98-63f4134c83d0' })
    sessionId: string
}

export class AccountUserResponseDto extends OmitType(TbAccountUserDto, ['password'] as const) {}

export class AccountUserSummaryResponseDto extends PickType(AccountUserResponseDto, ['uid', 'number', 'name', 'avatar'] as const) {}

export class MenuTreeNodeResponseDto extends TbAccountMenuDto {
    @ApiProperty({ description: '下级菜单节点', type: () => MenuTreeNodeResponseDto, isArray: true, example: [] })
    children: MenuTreeNodeResponseDto[]
}

export class MenuPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '菜单分页数据；每条记录为当前父节点的直接下级，并包含下级节点', type: [MenuTreeNodeResponseDto] })
    list: MenuTreeNodeResponseDto[]
}

export class OrganizationTreeNodeResponseDto extends TbAccountOrganizationDto {
    @ApiProperty({ description: '组织成员数量', example: 12 })
    memberCount: number

    @ApiProperty({ description: '组织负责人', type: AccountUserSummaryResponseDto, nullable: true, required: false })
    leader?: AccountUserSummaryResponseDto | null

    @ApiProperty({ description: '下级组织节点', type: () => OrganizationTreeNodeResponseDto, isArray: true, example: [] })
    children: OrganizationTreeNodeResponseDto[]
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

    @ApiProperty({ description: '当前账号可访问的菜单树', type: [MenuTreeNodeResponseDto] })
    menuTree: MenuTreeNodeResponseDto[]
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
}

export class UserPageResponseDto extends PageResponseDataDto {
    @ApiProperty({ description: '账号列表', type: [UserDetailResponseDto] })
    list: UserDetailResponseDto[]
}
