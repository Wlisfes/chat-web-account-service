import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository, Repository, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { EntityManager, In } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, isEmpty, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as feign from '@wlisfes/chat-web-base-schema/feign'
import * as UserDto from '@/modules/user/dto/user.dto'

@Injectable()
export class UserUtilsService {
    constructor(
        @InjectRepository(Schema.TbAccountUser) private readonly userRepository: Repository<Schema.TbAccountUser>,
        @InjectRepository(Schema.TbAccountChunk) private readonly chunkRepository: Repository<Schema.TbAccountChunk>,
        private readonly database: DataBaseService,
        private readonly skylineFeignClient: feign.FeignClientSkylineManager,
        private readonly configService: ConfigService
    ) {}

    /**
     * 通过 Skyline Feign 获取账号枚举（岗位、职级等），返回 枚举主键 -> 枚举名称。
     *
     * 枚举主键即枚举项 value（tb_account_chunk.chunk_id 存储该值），仅包含启用状态的枚举项。
     */
    public async findChunkOptions(type: Schema.TbSkylineChunkModuleType): Promise<Map<number, string>> {
        const authorization = feign.resolveFeignServiceAuthorization(this.configService)
        const record = await this.skylineFeignClient.httpBaseSkylineChunkOptionColumn(authorization, { types: [type] })
        const options = new Map<number, string>()
        const stack = [...(record[type]?.options ?? [])]
        while (stack.length > 0) {
            const option = stack.shift() as feign.SkylineChunkOption
            const keyId = Number(option.value)
            if (Number.isInteger(keyId) && keyId > 0) {
                options.set(keyId, option.label)
            }
            stack.push(...(option.children ?? []))
        }
        return options
    }

    /**获取岗位枚举（CHUNK_SYSTEM_ACCOUNT_USER_POST）。*/
    public findPostOptions(): Promise<Map<number, string>> {
        return this.findChunkOptions(Schema.TbSkylineChunkModuleType.CHUNK_SYSTEM_ACCOUNT_USER_POST)
    }

    /**获取职级枚举（CHUNK_SYSTEM_ACCOUNT_USER_LEVEL）。*/
    public findLevelOptions(): Promise<Map<number, string>> {
        return this.findChunkOptions(Schema.TbSkylineChunkModuleType.CHUNK_SYSTEM_ACCOUNT_USER_LEVEL)
    }

    /**按枚举主键还原枚举名称，不存在或已禁用的枚举项不返回。*/
    public toChunkOptions(keyIds: number[], options: Map<number, string>): UserDto.UserChunkResponseDto[] {
        return keyIds.flatMap(keyId => {
            const name = options.get(keyId)
            return name === undefined ? [] : [{ keyId, name }]
        })
    }

    /**获取账号完整详情*/
    public async findDetail(targetUid: string): Promise<UserDto.UserDetailResponseDto> {
        const normalizedTargetUid = assertUid(targetUid, '账号UID')
        const user = await this.database.builder(this.userRepository, qb => qb.where('t.uid = :uid', { uid: normalizedTargetUid }).getOne())
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        const [memberships, roleRelations, postRelations, levelRelations] = await Promise.all([
            this.userRepository.manager.find(Schema.TbAccountUserOrganization, { where: { userUid: normalizedTargetUid } }),
            this.userRepository.manager.find(Schema.TbAccountUserRole, { where: { userUid: normalizedTargetUid } }),
            this.chunkRepository.find({ where: { linkName: Schema.TbAccountChunkLinkName.USER_POST, linkId: normalizedTargetUid } }),
            this.chunkRepository.find({ where: { linkName: Schema.TbAccountChunkLinkName.USER_LEVEL, linkId: normalizedTargetUid } })
        ])
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        const roleKeyIds = roleRelations.map(item => item.roleKeyId)
        const postKeyIds = postRelations.map(item => item.chunkId)
        const levelKeyIds = levelRelations.map(item => item.chunkId)
        const [organizations, roles, postOptions, levelOptions] = await Promise.all([
            organizationKeyIds.length > 0
                ? this.userRepository.manager.find(Schema.TbAccountOrganization, { where: { keyId: In(organizationKeyIds) } })
                : [],
            roleKeyIds.length > 0 ? this.userRepository.manager.find(Schema.TbAccountRole, { where: { keyId: In(roleKeyIds) } }) : [],
            postKeyIds.length > 0 ? this.findPostOptions() : new Map<number, string>(),
            levelKeyIds.length > 0 ? this.findLevelOptions() : new Map<number, string>()
        ])
        const membershipByOrganization = new Map(memberships.map(item => [item.organizationKeyId, item]))
        return {
            ...user,
            memberships,
            organizationKeyIds,
            organizations: organizations.map(organization => ({
                ...organization,
                isPrimary: membershipByOrganization.get(organization.keyId)?.isPrimary ?? false,
                postName: membershipByOrganization.get(organization.keyId)?.postName,
                membershipStatus:
                    membershipByOrganization.get(organization.keyId)?.status ?? Schema.TbAccountUserOrganizationStatus.DISABLED
            })),
            roleKeyIds,
            roles,
            postKeyIds,
            posts: this.toChunkOptions(postKeyIds, postOptions),
            levelKeyIds,
            levels: this.toChunkOptions(levelKeyIds, levelOptions)
        }
    }

    /**按组织主键生成默认组织关系，首个为主组织*/
    public createMembershipsByOrganizationKeyIds(organizationKeyIds: number[] = []): UserDto.UserOrganizationMembershipDto[] {
        return organizationKeyIds.map((organizationKeyId, index) => ({
            organizationKeyId,
            isPrimary: index === 0,
            status: Schema.TbAccountUserOrganizationStatus.ENABLED
        }))
    }

    /**优先使用 memberships，否则按组织主键生成*/
    public resolveMemberships(
        input: { memberships?: UserDto.UserOrganizationMembershipDto[]; organizationKeyIds?: number[] },
        required = false
    ): UserDto.UserOrganizationMembershipDto[] {
        if (input.memberships !== undefined) {
            return input.memberships
        }
        if (input.organizationKeyIds !== undefined) {
            return this.createMembershipsByOrganizationKeyIds(input.organizationKeyIds)
        }
        if (required) {
            throw new BadRequestException('组织关系列表必须是数组')
        }
        return []
    }

    /**校验账号组织关系规则*/
    public findMembershipsRequired(memberships: UserDto.UserOrganizationMembershipDto[]): void {
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
            throw new BadRequestException('同一个组织不能重复关联')
        }
        const primaryCount = memberships.filter(item => item.isPrimary).length
        if (memberships.length > 0 && primaryCount !== 1) {
            throw new BadRequestException('存在组织关系时必须且只能设置一个主组织')
        }
        if (memberships.some(item => item.isPrimary && item.status !== Schema.TbAccountUserOrganizationStatus.ENABLED)) {
            throw new BadRequestException('主组织关系必须启用')
        }
    }

    /**锁定并获取目标账号*/
    public async lockUser(manager: EntityManager, userUid: string): Promise<Schema.TbAccountUser> {
        const user = await manager.findOne(Schema.TbAccountUser, { where: { uid: userUid }, lock: { mode: 'pessimistic_write' } })
        if (!user) {
            throw new NotFoundException('账号不存在')
        }
        return user
    }

    /**校验组织列表存在且已启用*/
    public async findOrganizationsRequired(manager: EntityManager, organizationKeyIds: number[]): Promise<void> {
        if (organizationKeyIds.length === 0) {
            return
        }
        const organizations = await manager.find(Schema.TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: Schema.TbAccountOrganizationStatus.ENABLED }
        })
        if (organizations.length !== organizationKeyIds.length) {
            throw new BadRequestException('组织关系列表包含不存在或已禁用的组织')
        }
    }

    /**校验角色列表存在且已启用*/
    public async findRolesRequired(manager: EntityManager, roleKeyIds: number[]): Promise<void> {
        if (roleKeyIds.length === 0) {
            return
        }
        const roles = await manager.find(Schema.TbAccountRole, {
            where: { keyId: In(roleKeyIds), status: Schema.TbAccountRoleStatus.ENABLED }
        })
        if (roles.length !== roleKeyIds.length) {
            throw new BadRequestException('角色列表包含不存在或已禁用的角色')
        }
    }

    /**校验岗位列表均为 Skyline 中启用状态的岗位枚举。*/
    public async findPostsRequired(postKeyIds: number[]): Promise<void> {
        if (postKeyIds.length === 0) return
        const postOptions = await this.findPostOptions()
        if (postKeyIds.some(keyId => !postOptions.has(keyId))) throw new BadRequestException('岗位列表包含不存在或已禁用的岗位')
    }

    /**校验职级列表均为 Skyline 中启用状态的职级枚举。*/
    public async findLevelsRequired(levelKeyIds: number[]): Promise<void> {
        if (levelKeyIds.length === 0) return
        const levelOptions = await this.findLevelOptions()
        if (levelKeyIds.some(keyId => !levelOptions.has(keyId))) throw new BadRequestException('职级列表包含不存在或已禁用的职级')
    }

    /**批量写入账号组织关系*/
    public async insertMemberships(
        manager: EntityManager,
        userUid: string,
        memberships: UserDto.UserOrganizationMembershipDto[]
    ): Promise<void> {
        if (memberships.length === 0) {
            await this.syncDepartmentRoles(manager, userUid)
            return
        }
        await manager.insert(
            Schema.TbAccountUserOrganization,
            memberships.map(item => ({
                userUid,
                organizationKeyId: item.organizationKeyId,
                isPrimary: item.isPrimary,
                postName: item.postName,
                status: item.status
            }))
        )
        await this.syncDepartmentRoles(manager, userUid)
    }

    /**部门角色默认关联当前启用部门成员，角色主键与组织主键一致。*/
    public async syncDepartmentRoles(manager: EntityManager, userUid: string): Promise<void> {
        const memberships = await manager.find(Schema.TbAccountUserOrganization, {
            where: { userUid, status: Schema.TbAccountUserOrganizationStatus.ENABLED }
        })
        const organizationKeyIds = memberships.map(item => item.organizationKeyId)
        const assigned = await manager.find(Schema.TbAccountUserRole, { where: { userUid } })
        const assignedRoleKeyIds = new Set(assigned.map(item => item.roleKeyId))
        if (assigned.length > 0) {
            const assignedRoles = await manager.find(Schema.TbAccountRole, {
                where: { keyId: In(assigned.map(item => item.roleKeyId)), builtin: false }
            })
            const staleRoleKeyIds = assignedRoles
                .filter(role => role.code.startsWith('dept_') && !organizationKeyIds.includes(role.keyId))
                .map(role => role.keyId)
            if (staleRoleKeyIds.length > 0) {
                await manager.delete(Schema.TbAccountUserRole, { userUid, roleKeyId: In(staleRoleKeyIds) })
            }
        }
        if (organizationKeyIds.length === 0) {
            return
        }
        const departmentRoles = await manager.find(Schema.TbAccountRole, {
            where: { keyId: In(organizationKeyIds), builtin: false }
        })
        const missingRoleKeyIds = departmentRoles.map(role => role.keyId).filter(roleKeyId => !assignedRoleKeyIds.has(roleKeyId))
        if (missingRoleKeyIds.length > 0) {
            await manager.insert(
                Schema.TbAccountUserRole,
                missingRoleKeyIds.map(roleKeyId => ({ userUid, roleKeyId }))
            )
        }
    }

    /**批量写入账号角色关系*/
    public async insertRoles(manager: EntityManager, userUid: string, roleKeyIds: number[]): Promise<void> {
        if (roleKeyIds.length === 0) {
            return
        }
        await manager.insert(
            Schema.TbAccountUserRole,
            roleKeyIds.map(roleKeyId => ({ userUid, roleKeyId }))
        )
    }

    /**替换账号枚举关系（岗位、职级等）。*/
    public async replaceChunks(
        manager: EntityManager,
        linkName: Schema.TbAccountChunkLinkName,
        userUid: string,
        chunkIds: number[]
    ): Promise<void> {
        await manager.delete(Schema.TbAccountChunk, { linkName, linkId: userUid })
        if (chunkIds.length > 0) {
            await manager.insert(
                Schema.TbAccountChunk,
                chunkIds.map(chunkId => ({ linkName, linkId: userUid, chunkId }))
            )
        }
    }

    /**替换账号岗位关系。*/
    public replacePosts(manager: EntityManager, userUid: string, postKeyIds: number[]): Promise<void> {
        return this.replaceChunks(manager, Schema.TbAccountChunkLinkName.USER_POST, userUid, postKeyIds)
    }

    /**替换账号职级关系。*/
    public replaceLevels(manager: EntityManager, userUid: string, levelKeyIds: number[]): Promise<void> {
        return this.replaceChunks(manager, Schema.TbAccountChunkLinkName.USER_LEVEL, userUid, levelKeyIds)
    }

    /**批量补充账号组织和角色信息，直接在原列表上追加字段并返回原列表*/
    public async enrichUsers(users: Schema.TbAccountUser[]): Promise<UserDto.UserDetailResponseDto[]> {
        const userUids = users.map(user => user.uid)
        if (userUids.length === 0) {
            return users as unknown as UserDto.UserDetailResponseDto[]
        }
        const [memberships, roleRelations, chunkRelations] = await Promise.all([
            this.userRepository.manager.find(Schema.TbAccountUserOrganization, { where: { userUid: In(userUids) } }),
            this.userRepository.manager.find(Schema.TbAccountUserRole, { where: { userUid: In(userUids) } }),
            this.chunkRepository.find({
                where: {
                    linkName: In([Schema.TbAccountChunkLinkName.USER_POST, Schema.TbAccountChunkLinkName.USER_LEVEL]),
                    linkId: In(userUids)
                }
            })
        ])
        const postRelations = chunkRelations.filter(item => item.linkName === Schema.TbAccountChunkLinkName.USER_POST)
        const levelRelations = chunkRelations.filter(item => item.linkName === Schema.TbAccountChunkLinkName.USER_LEVEL)
        const organizationKeyIds = [...new Set(memberships.map(item => item.organizationKeyId))]
        const roleKeyIds = [...new Set(roleRelations.map(item => item.roleKeyId))]
        const postKeyIds = [...new Set(postRelations.map(item => item.chunkId))]
        const levelKeyIds = [...new Set(levelRelations.map(item => item.chunkId))]
        const organizationsPromise: Promise<Schema.TbAccountOrganization[]> =
            organizationKeyIds.length > 0
                ? this.userRepository.manager.find(Schema.TbAccountOrganization, { where: { keyId: In(organizationKeyIds) } })
                : Promise.resolve([])
        const rolesPromise: Promise<Schema.TbAccountRole[]> =
            roleKeyIds.length > 0
                ? this.userRepository.manager.find(Schema.TbAccountRole, { where: { keyId: In(roleKeyIds) } })
                : Promise.resolve([])
        const postsPromise: Promise<Map<number, string>> =
            postKeyIds.length > 0 ? this.findPostOptions() : Promise.resolve(new Map<number, string>())
        const levelsPromise: Promise<Map<number, string>> =
            levelKeyIds.length > 0 ? this.findLevelOptions() : Promise.resolve(new Map<number, string>())
        const [organizations, roles, postOptions, levelOptions] = await Promise.all([
            organizationsPromise,
            rolesPromise,
            postsPromise,
            levelsPromise
        ])
        const organizationByKeyId = new Map<number, Schema.TbAccountOrganization>(organizations.map(item => [item.keyId, item]))
        const roleByKeyId = new Map<number, Schema.TbAccountRole>(roles.map(item => [item.keyId, item]))
        for (const user of users) {
            const userMemberships = memberships.filter(item => item.userUid === user.uid)
            const userRoleRelations = roleRelations.filter(item => item.userUid === user.uid)
            const userPostKeyIds = postRelations.filter(item => item.linkId === user.uid).map(item => item.chunkId)
            const userLevelKeyIds = levelRelations.filter(item => item.linkId === user.uid).map(item => item.chunkId)
            const userOrganizations: UserDto.UserOrganizationResponseDto[] = []
            for (const membership of userMemberships) {
                const organization = organizationByKeyId.get(membership.organizationKeyId)
                if (!organization) continue
                userOrganizations.push({
                    ...organization,
                    isPrimary: membership.isPrimary,
                    postName: membership.postName,
                    membershipStatus: membership.status
                })
            }
            const userRoles: Schema.TbAccountRole[] = []
            for (const relation of userRoleRelations) {
                const role = roleByKeyId.get(relation.roleKeyId)
                if (role) userRoles.push(role)
            }
            Object.assign(user, {
                memberships: userMemberships,
                organizationKeyIds: userMemberships.map(item => item.organizationKeyId),
                organizations: userOrganizations,
                roleKeyIds: userRoleRelations.map(item => item.roleKeyId),
                roles: userRoles,
                postKeyIds: userPostKeyIds,
                posts: this.toChunkOptions(userPostKeyIds, postOptions),
                levelKeyIds: userLevelKeyIds,
                levels: this.toChunkOptions(userLevelKeyIds, levelOptions)
            })
        }
        return users as unknown as UserDto.UserDetailResponseDto[]
    }

    /**
     * 批量查询账号所属组织摘要，供 Feign 账号还原使用；只返回启用的成员关系和启用的组织，主组织排在前面。
     */
    public async findUserOrganizationSummaries(userUids: string[]): Promise<Map<string, feign.AccountUserOrganizationSummary[]>> {
        const result = new Map<string, feign.AccountUserOrganizationSummary[]>()
        if (userUids.length === 0) {
            return result
        }
        const memberships = await this.userRepository.manager.find(Schema.TbAccountUserOrganization, {
            where: { userUid: In(userUids), status: Schema.TbAccountUserOrganizationStatus.ENABLED },
            order: { isPrimary: 'DESC', keyId: 'ASC' }
        })
        const organizationKeyIds = [...new Set(memberships.map(item => item.organizationKeyId))]
        if (organizationKeyIds.length === 0) {
            return result
        }
        const organizations = await this.userRepository.manager.find(Schema.TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: Schema.TbAccountOrganizationStatus.ENABLED }
        })
        const organizationByKeyId = new Map(organizations.map(item => [item.keyId, item]))
        for (const membership of memberships) {
            const organization = organizationByKeyId.get(membership.organizationKeyId)
            if (!organization) {
                continue
            }
            const items = result.get(membership.userUid) ?? []
            items.push({
                keyId: organization.keyId,
                name: organization.name,
                code: organization.code,
                isPrimary: membership.isPrimary,
                postName: membership.postName
            })
            result.set(membership.userUid, items)
        }
        return result
    }

    /**裁剪账号分页字段，只保留列表展示和操作所需的关联摘要；直接修改原列表并返回原列表*/
    public toColumnUsers(users: UserDto.UserDetailResponseDto[]): UserDto.UserColumnResponseDto[] {
        for (const user of users as Array<Partial<UserDto.UserDetailResponseDto>>) {
            const organizations = user.organizations ?? []
            const roles = user.roles ?? []
            delete user.memberships
            Object.assign(user, {
                organizations: organizations.map(({ keyId, name, code }) => ({ keyId, name, code })),
                roles: roles.map(({ keyId, name, code }) => ({ keyId, name, code }))
            })
        }
        return users as unknown as UserDto.UserColumnResponseDto[]
    }

    /**校验操作者为超级管理员*/
    public async findSuperAdminRequired(principal: AuthPrincipal, message: string): Promise<void> {
        if (principal.superAdmin !== true) {
            throw new ForbiddenException(message)
        }
    }

    /**校验不能移除系统中最后一个超级管理员*/
    public async findLastSuperAdminRemovalAvailable(manager: EntityManager, targetUid: string, roleKeyIds: number[]): Promise<void> {
        const superAdminRole = await manager.findOneBy(Schema.TbAccountRole, { code: 'super_admin' })
        if (!superAdminRole || roleKeyIds.includes(superAdminRole.keyId)) {
            return
        }
        const assignments = await this.database.builder(manager.getRepository(Schema.TbAccountUserRole), qb =>
            qb.where('t.roleKeyId = :roleKeyId', { roleKeyId: superAdminRole.keyId }).setLock('pessimistic_write').getMany()
        )
        if (assignments.some(item => item.userUid === targetUid) && assignments.length <= 1) {
            throw new BadRequestException('不能移除系统中最后一个超级管理员')
        }
    }

    /**校验账号工号、手机号和邮箱唯一*/
    public async findUserUnique(
        manager: EntityManager,
        input: Pick<Partial<Schema.TbAccountUser>, 'number' | 'phone' | 'email'>,
        excludedUid?: string
    ): Promise<void> {
        const checks = [
            ['number', input.number?.trim(), '工号'],
            ['phone', input.phone?.trim(), '手机号'],
            ['email', input.email?.trim(), '邮箱']
        ] as const
        for (const [field, value, label] of checks) {
            if (isEmpty(value)) {
                continue
            }
            const exists = await this.database.builder(manager.getRepository(Schema.TbAccountUser), qb => {
                qb.where(`t.${field} = :value`, { value: value ?? '' })
                if (isNotEmpty(excludedUid)) {
                    qb.andWhere('t.uid <> :excludedUid', { excludedUid })
                }
                return qb.getExists()
            })
            if (exists) {
                throw new ConflictException(`${label}已存在`)
            }
        }
    }

    /**转义 LIKE 查询特殊字符*/
    public escapeLike(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    }
}
