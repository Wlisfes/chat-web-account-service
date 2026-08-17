import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountMenu,
    TbAccountMenuStatus,
    TbAccountOrganization,
    TbAccountOrganizationStatus,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleDataScopeType,
    TbAccountRoleMenu,
    TbAccountRoleStatus,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { EntityManager, In, Repository } from 'typeorm'
import {
    CreateRoleDto,
    ReplaceRoleDataScopesDto,
    ReplaceRoleMenusDto,
    RoleDataScopeRuleDto,
    UpdateRoleDto
} from '@/modules/roles/dto/role.dto'
import { PermissionsService } from '@/modules/permissions/permissions.service'

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        private readonly permissionsService: PermissionsService
    ) {}

    findAll(): Promise<TbAccountRole[]> {
        return this.roleRepository.find({ order: { sort: 'ASC', keyId: 'ASC' } })
    }

    async findOne(keyId: number) {
        const role = await this.roleRepository.findOneBy({ keyId })
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
        const [menuRelations, dataScopes] = await Promise.all([
            this.roleRepository.manager.find(TbAccountRoleMenu, { where: { roleKeyId: keyId } }),
            this.roleRepository.manager.find(TbAccountRoleDataScope, { where: { roleKeyId: keyId } })
        ])
        const scopeKeyIds = dataScopes.map(scope => scope.keyId)
        const scopeOrganizations = scopeKeyIds.length
            ? await this.roleRepository.manager.find(TbAccountRoleDataScopeOrganization, { where: { dataScopeKeyId: In(scopeKeyIds) } })
            : []
        return {
            ...role,
            menuKeyIds: menuRelations.map(relation => relation.menuKeyId),
            dataScopes: dataScopes.map(scope => ({
                ...scope,
                organizations: scopeOrganizations.filter(item => item.dataScopeKeyId === scope.keyId)
            }))
        }
    }

    async create(input: CreateRoleDto): Promise<TbAccountRole> {
        if (input.code.trim() === 'super_admin') {
            throw new ConflictException('super_admin 是保留角色编码')
        }
        await this.assertCodeAvailable(this.roleRepository.manager, input.code)
        const role = this.roleRepository.create({ ...input, builtin: false })
        return this.roleRepository.save(role)
    }

    async update(actorUid: string, keyId: number, input: UpdateRoleDto): Promise<TbAccountRole> {
        const role = await this.roleRepository.findOneBy({ keyId })
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
        if (role.builtin && input.code && input.code !== role.code) {
            throw new ConflictException('系统内置角色不能修改编码')
        }
        if (role.builtin && !(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ConflictException('只有超级管理员可以修改系统内置角色')
        }
        if (role.code === 'super_admin' && input.status === TbAccountRoleStatus.DISABLED) {
            throw new ConflictException('超级管理员角色不能禁用')
        }
        if (input.code && input.code !== role.code) {
            await this.assertCodeAvailable(this.roleRepository.manager, input.code, keyId)
        }
        this.roleRepository.merge(role, input)
        return this.roleRepository.save(role)
    }

    async remove(keyId: number): Promise<void> {
        await this.roleRepository.manager.transaction(async manager => {
            const role = await manager.findOneBy(TbAccountRole, { keyId })
            if (!role) {
                throw new NotFoundException('角色不存在')
            }
            if (role.builtin) {
                throw new ConflictException('系统内置角色不能删除')
            }
            if (await manager.existsBy(TbAccountUserRole, { roleKeyId: keyId })) {
                throw new ConflictException('角色仍有关联用户，不能删除')
            }
            const scopes = await manager.find(TbAccountRoleDataScope, { where: { roleKeyId: keyId }, select: { keyId: true } })
            const scopeKeyIds = scopes.map(scope => scope.keyId)
            if (scopeKeyIds.length) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(scopeKeyIds) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleKeyId: keyId })
            await manager.delete(TbAccountRoleMenu, { roleKeyId: keyId })
            await manager.delete(TbAccountRole, { keyId })
        })
    }

    async replaceMenus(actorUid: string, roleKeyId: number, input: ReplaceRoleMenusDto): Promise<void> {
        await this.assertSuperAdmin(actorUid)
        const menuKeyIds = input.menuKeyIds
        await this.roleRepository.manager.transaction(async manager => {
            await this.assertRoleExists(manager, roleKeyId)
            if (menuKeyIds.length) {
                const menus = await manager.find(TbAccountMenu, { where: { keyId: In(menuKeyIds), status: TbAccountMenuStatus.ENABLED } })
                if (menus.length !== menuKeyIds.length) {
                    throw new BadRequestException('菜单列表包含不存在或已禁用的节点')
                }
            }
            await manager.delete(TbAccountRoleMenu, { roleKeyId })
            if (menuKeyIds.length) {
                await manager.insert(
                    TbAccountRoleMenu,
                    menuKeyIds.map(menuKeyId => ({ roleKeyId, menuKeyId }))
                )
            }
        })
    }

    async replaceDataScopes(actorUid: string, roleKeyId: number, input: ReplaceRoleDataScopesDto): Promise<void> {
        await this.assertSuperAdmin(actorUid)
        this.assertDataScopeRules(input.rules)
        await this.roleRepository.manager.transaction(async manager => {
            await this.assertRoleExists(manager, roleKeyId)
            const organizationKeyIds = [
                ...new Set(input.rules.flatMap(rule => rule.organizations?.map(item => item.organizationKeyId) ?? []))
            ]
            if (organizationKeyIds.length) {
                const organizations = await manager.find(TbAccountOrganization, {
                    where: { keyId: In(organizationKeyIds), status: TbAccountOrganizationStatus.ENABLED }
                })
                if (organizations.length !== organizationKeyIds.length) {
                    throw new BadRequestException('数据范围包含不存在或已禁用的组织')
                }
            }

            const previousScopes = await manager.find(TbAccountRoleDataScope, { where: { roleKeyId }, select: { keyId: true } })
            const previousScopeKeyIds = previousScopes.map(scope => scope.keyId)
            if (previousScopeKeyIds.length) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(previousScopeKeyIds) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleKeyId })

            for (const rule of input.rules) {
                const scope = manager.create(TbAccountRoleDataScope, {
                    roleKeyId,
                    resourceCode: rule.resourceCode.trim(),
                    scopeType: rule.scopeType,
                    status: rule.status
                })
                await manager.save(scope)
                if (rule.scopeType === TbAccountRoleDataScopeType.CUSTOM && rule.organizations?.length) {
                    await manager.insert(
                        TbAccountRoleDataScopeOrganization,
                        rule.organizations.map(item => ({
                            dataScopeKeyId: scope.keyId,
                            organizationKeyId: item.organizationKeyId,
                            includeChildren: item.includeChildren
                        }))
                    )
                }
            }
        })
    }

    private assertDataScopeRules(rules: RoleDataScopeRuleDto[]): void {
        const resourceCodes = rules.map(rule => rule.resourceCode.trim())
        if (new Set(resourceCodes).size !== resourceCodes.length) {
            throw new BadRequestException('同一个角色的业务资源编码不能重复')
        }
        for (const rule of rules) {
            const organizations = rule.organizations ?? []
            if (rule.scopeType === TbAccountRoleDataScopeType.CUSTOM && !organizations.length) {
                throw new BadRequestException(`自定义数据范围 ${rule.resourceCode} 至少需要一个组织`)
            }
            if (rule.scopeType !== TbAccountRoleDataScopeType.CUSTOM && organizations.length) {
                throw new BadRequestException(`非自定义数据范围 ${rule.resourceCode} 不能配置组织列表`)
            }
            const organizationKeyIds = organizations.map(item => item.organizationKeyId)
            if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
                throw new BadRequestException(`数据范围 ${rule.resourceCode} 的组织不能重复`)
            }
        }
    }

    private async assertRoleExists(manager: EntityManager, roleKeyId: number): Promise<void> {
        const role = await manager.findOne(TbAccountRole, { where: { keyId: roleKeyId }, lock: { mode: 'pessimistic_write' } })
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
    }

    private async assertSuperAdmin(actorUid: string): Promise<void> {
        if (!(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ConflictException('只有超级管理员可以配置角色权限')
        }
    }

    private async assertCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const query = manager.getRepository(TbAccountRole).createQueryBuilder('role').where('role.code = :code', { code: code.trim() })
        if (excludedKeyId) {
            query.andWhere('role.keyId <> :excludedKeyId', { excludedKeyId })
        }
        if (await query.getExists()) {
            throw new ConflictException('角色编码已存在')
        }
    }
}
