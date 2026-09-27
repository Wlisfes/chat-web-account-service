import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { DataBaseService, EntityManager, In, InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, buildTree, type TreeNode } from '@wlisfes/chat-web-base-schema/utils'
import { isNotEmpty } from 'class-validator'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as RoleDto from '@/modules/role/dto/role.dto'

@Injectable()
export class RoleUtilsService {
    constructor(
        @InjectRepository(Schema.TbAccountRole) private readonly roleRepository: Repository<Schema.TbAccountRole>,
        private readonly database: DataBaseService
    ) {}

    /**获取角色及数据范围列表*/
    public async findAll(): Promise<Array<RoleDto.RoleResponseDto>> {
        const roles = await this.database.builder(this.roleRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        const roleKeyIds = roles.map(role => role.keyId)
        if (roleKeyIds.length === 0) {
            return []
        }

        const dataScopes = await this.roleRepository.manager.find(Schema.TbAccountRoleDataScope, {
            where: { roleKeyId: In(roleKeyIds) },
            order: { keyId: 'ASC' }
        })
        const dataScopeKeyIds = dataScopes.map(scope => scope.keyId)
        const scopeOrganizations =
            dataScopeKeyIds.length > 0
                ? await this.roleRepository.manager.find(Schema.TbAccountRoleDataScopeOrganization, {
                      where: { dataScopeKeyId: In(dataScopeKeyIds) },
                      order: { keyId: 'ASC' }
                  })
                : []
        const organizationsByScope = new Map<number, Schema.TbAccountRoleDataScopeOrganization[]>()
        for (const organization of scopeOrganizations) {
            const organizations = organizationsByScope.get(organization.dataScopeKeyId) ?? []
            organizations.push(organization)
            organizationsByScope.set(organization.dataScopeKeyId, organizations)
        }
        const scopesByRole = new Map<
            number,
            Array<Schema.TbAccountRoleDataScope & { organizations: Schema.TbAccountRoleDataScopeOrganization[] }>
        >()
        for (const scope of dataScopes) {
            const scopes = scopesByRole.get(scope.roleKeyId) ?? []
            scopes.push({ ...scope, organizations: organizationsByScope.get(scope.keyId) ?? [] })
            scopesByRole.set(scope.roleKeyId, scopes)
        }
        return roles.map(role => ({ ...role, dataScopes: scopesByRole.get(role.keyId) ?? [] }))
    }

    /**获取通用角色列表和岗位角色树*/
    public async findConfiger(): Promise<RoleDto.RoleConfigerResponseDto> {
        const [roles, organizations] = await Promise.all([
            this.findAll(),
            this.roleRepository.manager.find(Schema.TbAccountOrganization, { order: { sort: 'ASC', keyId: 'ASC' } })
        ])
        const rolesByOrganization = new Map<number, RoleDto.RoleResponseDto>()
        for (const role of roles) {
            const organizationKeyIds = new Set(role.dataScopes.flatMap(scope => scope.organizations.map(item => item.organizationKeyId)))
            if (organizationKeyIds.size !== 1) continue
            const [organizationKeyId] = organizationKeyIds
            if (!rolesByOrganization.has(organizationKeyId)) {
                rolesByOrganization.set(organizationKeyId, role)
            }
        }
        const roleKeyIds = new Set([...rolesByOrganization.values()].map(role => role.keyId))
        const tree = buildTree(
            organizations.map(organization => ({
                keyId: organization.keyId,
                parentKeyId: organization.parentKeyId,
                name: organization.name,
                type: organization.type,
                sort: organization.sort
            }))
        )
        const roots = tree.flatMap(node => (node.type === Schema.TbAccountOrganizationType.COMPANY ? node.children : [node]))
        return {
            list: roles.filter(role => !roleKeyIds.has(role.keyId)),
            tree: this.findConfigerTree(roots, rolesByOrganization)
        }
    }

    /**组装组织与岗位角色树，只保留自身或下级绑定角色的组织*/
    private findConfigerTree(
        nodes: Array<TreeNode<Pick<RoleDto.RoleConfigerTreeNodeResponseDto, 'keyId' | 'parentKeyId' | 'name' | 'type' | 'sort'>>>,
        rolesByOrganization: Map<number, RoleDto.RoleResponseDto>
    ): RoleDto.RoleConfigerTreeNodeResponseDto[] {
        return nodes.flatMap(node => {
            const children = this.findConfigerTree(node.children, rolesByOrganization)
            const role = rolesByOrganization.get(node.keyId)
            if (!role && children.length === 0) return []
            return [{ ...node, nodeId: role?.keyId ?? -node.keyId, node: role, disabled: !role, children }]
        })
    }

    /**获取角色、菜单和数据范围详情*/
    public async findDetail(keyId: number): Promise<RoleDto.RoleResponseDto> {
        const role = await this.findRequired(keyId)
        const [sheetRelations, dataScopes] = await Promise.all([
            this.roleRepository.manager.find(Schema.TbAccountRoleSheet, { where: { roleKeyId: keyId } }),
            this.roleRepository.manager.find(Schema.TbAccountRoleDataScope, { where: { roleKeyId: keyId } })
        ])
        const scopeKeyIds = dataScopes.map(scope => scope.keyId)
        const scopeOrganizations =
            scopeKeyIds.length > 0
                ? await this.roleRepository.manager.find(Schema.TbAccountRoleDataScopeOrganization, {
                      where: { dataScopeKeyId: In(scopeKeyIds) }
                  })
                : []
        return {
            ...role,
            sheetKeyIds: sheetRelations.map(relation => relation.sheetKeyId),
            dataScopes: dataScopes.map(scope => ({
                ...scope,
                organizations: scopeOrganizations.filter(item => item.dataScopeKeyId === scope.keyId)
            }))
        }
    }

    /**获取必需的角色详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<Schema.TbAccountRole> {
        const role = isNotEmpty(manager)
            ? await manager.findOne(Schema.TbAccountRole, { where: { keyId }, lock: { mode: 'pessimistic_write' } })
            : await this.database.builder(this.roleRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
        return role
    }

    /**校验角色存在且已启用*/
    public async findEnabledRequired(manager: EntityManager, keyId: number): Promise<Schema.TbAccountRole> {
        const role = await this.findRequired(keyId, manager)
        if (role.status !== Schema.TbAccountRoleStatus.ENABLED) {
            throw new BadRequestException('角色已禁用，不能关联用户')
        }
        return role
    }

    /**校验并规范化账号UID列表*/
    public findUidsRequired(uids: string[]): string[] {
        const normalizedUids = uids.map(uid => assertUid(uid, '账号UID'))
        if (new Set(normalizedUids).size !== normalizedUids.length) {
            throw new BadRequestException('账号UID不能重复')
        }
        return normalizedUids
    }

    /**锁定并校验账号列表存在*/
    public async findUsersRequired(manager: EntityManager, uids: string[]): Promise<void> {
        const users = await manager.find(Schema.TbAccountUser, {
            where: { uid: In(uids) },
            order: { uid: 'ASC' },
            lock: { mode: 'pessimistic_write' }
        })
        if (users.length !== uids.length) {
            throw new NotFoundException('账号列表包含不存在的账号')
        }
    }

    /**批量写入角色用户关联*/
    public async insertRoleUsers(manager: EntityManager, roleKeyId: number, uids: string[]): Promise<void> {
        const relations = await manager.find(Schema.TbAccountUserRole, { where: { roleKeyId, userUid: In(uids) } })
        const linkedUids = new Set(relations.map(item => item.userUid))
        const insertUids = uids.filter(uid => !linkedUids.has(uid))
        if (insertUids.length === 0) {
            return
        }
        await manager.insert(
            Schema.TbAccountUserRole,
            insertUids.map(userUid => manager.create(Schema.TbAccountUserRole, { userUid, roleKeyId }))
        )
    }

    /**批量删除角色用户关联*/
    public async deleteRoleUsers(manager: EntityManager, role: Schema.TbAccountRole, uids: string[]): Promise<void> {
        if (role.code === 'super_admin') {
            const assignments = await this.database.builder(manager.getRepository(Schema.TbAccountUserRole), qb =>
                qb.where('t.roleKeyId = :roleKeyId', { roleKeyId: role.keyId }).setLock('pessimistic_write').getMany()
            )
            const removedUids = new Set(uids)
            if (assignments.length > 0 && assignments.every(item => removedUids.has(item.userUid))) {
                throw new BadRequestException('不能移除系统中最后一个超级管理员')
            }
        }
        await manager.delete(Schema.TbAccountUserRole, { roleKeyId: role.keyId, userUid: In(uids) })
    }

    /**校验角色允许删除*/
    public async findDeleteAvailable(manager: EntityManager, role: Schema.TbAccountRole): Promise<void> {
        if (role.builtin) {
            throw new ConflictException('系统内置角色不能删除')
        }
        if (await manager.existsBy(Schema.TbAccountUserRole, { roleKeyId: role.keyId })) {
            throw new ConflictException('角色仍有关联用户，不能删除')
        }
    }

    /**校验操作者为超级管理员*/
    public async findSuperAdminRequired(principal: AuthPrincipal, message: string): Promise<void> {
        if (principal.superAdmin !== true) {
            throw new ConflictException(message)
        }
    }

    /**校验角色编码可用*/
    public async findCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const exists = await this.database.builder(manager.getRepository(Schema.TbAccountRole), qb => {
            qb.where('t.code = :code', { code: code.trim() })
            if (isNotEmpty(excludedKeyId)) {
                qb.andWhere('t.keyId <> :excludedKeyId', { excludedKeyId })
            }
            return qb.getExists()
        })
        if (exists) {
            throw new ConflictException('角色编码已存在')
        }
    }

    /**校验菜单列表存在且已启用*/
    public async findSheetsRequired(manager: EntityManager, sheetKeyIds: number[]): Promise<void> {
        if (sheetKeyIds.length === 0) return
        const sheets = await manager.find(Schema.TbAccountSheet, {
            where: { keyId: In(sheetKeyIds), status: Schema.TbAccountSheetStatus.ENABLED }
        })
        if (sheets.length !== sheetKeyIds.length) {
            throw new BadRequestException('菜单列表包含不存在或已禁用的节点')
        }
    }

    /**校验组织列表存在且已启用*/
    public async findOrganizationsRequired(manager: EntityManager, organizationKeyIds: number[]): Promise<void> {
        if (organizationKeyIds.length === 0) return
        const organizations = await manager.find(Schema.TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: Schema.TbAccountOrganizationStatus.ENABLED }
        })
        if (organizations.length !== organizationKeyIds.length) {
            throw new BadRequestException('数据范围包含不存在或已禁用的组织')
        }
    }

    /**校验数据范围配置权限和规则*/
    public async findDataScopesRequired(principal: AuthPrincipal, rules?: RoleDto.RoleDataScopeRuleDto[]): Promise<void> {
        if (!rules) {
            return
        }
        await this.findSuperAdminRequired(principal, '只有超级管理员可以配置角色权限')
        this.findDataScopeRulesRequired(rules)
    }

    /**校验数据范围组织存在且已启用*/
    public async findDataScopeOrganizationsRequired(manager: EntityManager, rules?: RoleDto.RoleDataScopeRuleDto[]): Promise<void> {
        const organizationKeyIds = [...new Set(rules?.flatMap(rule => rule.organizations?.map(item => item.organizationKeyId) ?? []) ?? [])]
        await this.findOrganizationsRequired(manager, organizationKeyIds)
    }

    /**校验角色数据范围规则*/
    public findDataScopeRulesRequired(rules: RoleDto.RoleDataScopeRuleDto[]): void {
        const resourceCodes = rules.map(rule => rule.resourceCode.trim())
        if (new Set(resourceCodes).size !== resourceCodes.length) {
            throw new BadRequestException('同一个角色的业务资源编码不能重复')
        }
        for (const rule of rules) {
            const organizations = rule.organizations ?? []
            if (rule.scopeType === Schema.TbAccountRoleDataScopeType.CUSTOM && organizations.length === 0) {
                throw new BadRequestException(`自定义数据范围 ${rule.resourceCode} 至少需要一个组织`)
            }
            if (rule.scopeType !== Schema.TbAccountRoleDataScopeType.CUSTOM && organizations.length > 0) {
                throw new BadRequestException(`非自定义数据范围 ${rule.resourceCode} 不能配置组织列表`)
            }
            const organizationKeyIds = organizations.map(item => item.organizationKeyId)
            if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
                throw new BadRequestException(`数据范围 ${rule.resourceCode} 的组织不能重复`)
            }
        }
    }

    /**清除角色数据范围关系**/
    public async clearRoleDataScopes(manager: EntityManager, roleKeyId: number): Promise<void> {
        const scopes = await manager.find(Schema.TbAccountRoleDataScope, {
            where: { roleKeyId },
            select: { keyId: true }
        })
        const scopeKeyIds = scopes.map(scope => scope.keyId)
        if (scopeKeyIds.length > 0) {
            await manager.delete(Schema.TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(scopeKeyIds) })
        }
        await manager.delete(Schema.TbAccountRoleDataScope, { roleKeyId })
    }

    /**清除角色菜单和数据范围关系**/
    public async clearRoleRelations(manager: EntityManager, roleKeyId: number): Promise<void> {
        await this.clearRoleDataScopes(manager, roleKeyId)
        await manager.delete(Schema.TbAccountRoleSheet, { roleKeyId })
    }

    /**替换角色菜单权限**/
    public async replaceRoleSheets(manager: EntityManager, roleKeyId: number, sheetKeyIds: number[]): Promise<void> {
        await manager.delete(Schema.TbAccountRoleSheet, { roleKeyId })
        if (sheetKeyIds.length > 0) {
            await manager.insert(
                Schema.TbAccountRoleSheet,
                sheetKeyIds.map(sheetKeyId => ({ roleKeyId, sheetKeyId }))
            )
        }
    }

    /**替换角色数据范围**/
    public async replaceRoleDataScopes(manager: EntityManager, roleKeyId: number, rules: RoleDto.RoleDataScopeRuleDto[]): Promise<void> {
        await this.clearRoleDataScopes(manager, roleKeyId)
        for (const rule of rules) {
            const scope = manager.create(Schema.TbAccountRoleDataScope, {
                roleKeyId,
                resourceCode: rule.resourceCode.trim(),
                scopeType: rule.scopeType,
                status: rule.status
            })
            await manager.save(scope)
            if (rule.scopeType === Schema.TbAccountRoleDataScopeType.CUSTOM && (rule.organizations?.length ?? 0) > 0) {
                await manager.insert(
                    Schema.TbAccountRoleDataScopeOrganization,
                    rule.organizations?.map(item => ({
                        dataScopeKeyId: scope.keyId,
                        organizationKeyId: item.organizationKeyId,
                        includeChildren: item.includeChildren
                    })) ?? []
                )
            }
        }
    }
}
