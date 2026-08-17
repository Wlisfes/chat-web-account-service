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
import { assertUid, generateUid } from '@/common/uid'
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

    async findOne(uid: string) {
        const normalizedUid = assertUid(uid, '角色UID')
        const role = await this.roleRepository.findOneBy({ uid: normalizedUid })
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
        const [menuRelations, dataScopes] = await Promise.all([
            this.roleRepository.manager.find(TbAccountRoleMenu, { where: { roleUid: normalizedUid } }),
            this.roleRepository.manager.find(TbAccountRoleDataScope, { where: { roleUid: normalizedUid } })
        ])
        const scopeUids = dataScopes.map(scope => scope.uid)
        const scopeOrganizations = scopeUids.length
            ? await this.roleRepository.manager.find(TbAccountRoleDataScopeOrganization, { where: { dataScopeUid: In(scopeUids) } })
            : []
        return {
            ...role,
            menuUids: menuRelations.map(relation => relation.menuUid),
            dataScopes: dataScopes.map(scope => ({
                ...scope,
                organizations: scopeOrganizations.filter(item => item.dataScopeUid === scope.uid)
            }))
        }
    }

    async create(input: CreateRoleDto): Promise<TbAccountRole> {
        if (input.code.trim() === 'super_admin') {
            throw new ConflictException('super_admin 是保留角色编码')
        }
        await this.assertCodeAvailable(this.roleRepository.manager, input.code)
        const role = this.roleRepository.create({ ...input, uid: generateUid(), builtin: false })
        return this.roleRepository.save(role)
    }

    async update(actorUid: string, uid: string, input: UpdateRoleDto): Promise<TbAccountRole> {
        const normalizedUid = assertUid(uid, '角色UID')
        const role = await this.roleRepository.findOneBy({ uid: normalizedUid })
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
            await this.assertCodeAvailable(this.roleRepository.manager, input.code, normalizedUid)
        }
        this.roleRepository.merge(role, input)
        return this.roleRepository.save(role)
    }

    async remove(uid: string): Promise<void> {
        const normalizedUid = assertUid(uid, '角色UID')
        await this.roleRepository.manager.transaction(async manager => {
            const role = await manager.findOneBy(TbAccountRole, { uid: normalizedUid })
            if (!role) {
                throw new NotFoundException('角色不存在')
            }
            if (role.builtin) {
                throw new ConflictException('系统内置角色不能删除')
            }
            if (await manager.existsBy(TbAccountUserRole, { roleUid: normalizedUid })) {
                throw new ConflictException('角色仍有关联用户，不能删除')
            }
            const scopes = await manager.find(TbAccountRoleDataScope, { where: { roleUid: normalizedUid }, select: { uid: true } })
            const scopeUids = scopes.map(scope => scope.uid)
            if (scopeUids.length) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeUid: In(scopeUids) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleUid: normalizedUid })
            await manager.delete(TbAccountRoleMenu, { roleUid: normalizedUid })
            await manager.delete(TbAccountRole, { uid: normalizedUid })
        })
    }

    async replaceMenus(actorUid: string, uid: string, input: ReplaceRoleMenusDto): Promise<void> {
        await this.assertSuperAdmin(actorUid)
        const roleUid = assertUid(uid, '角色UID')
        const menuUids = input.menuUids.map(menuUid => assertUid(menuUid, '菜单UID'))
        await this.roleRepository.manager.transaction(async manager => {
            await this.assertRoleExists(manager, roleUid)
            if (menuUids.length) {
                const menus = await manager.find(TbAccountMenu, { where: { uid: In(menuUids), status: TbAccountMenuStatus.ENABLED } })
                if (menus.length !== menuUids.length) {
                    throw new BadRequestException('菜单列表包含不存在或已禁用的节点')
                }
            }
            await manager.delete(TbAccountRoleMenu, { roleUid })
            if (menuUids.length) {
                await manager.insert(
                    TbAccountRoleMenu,
                    menuUids.map(menuUid => ({ roleUid, menuUid }))
                )
            }
        })
    }

    async replaceDataScopes(actorUid: string, uid: string, input: ReplaceRoleDataScopesDto): Promise<void> {
        await this.assertSuperAdmin(actorUid)
        const roleUid = assertUid(uid, '角色UID')
        this.assertDataScopeRules(input.rules)
        await this.roleRepository.manager.transaction(async manager => {
            await this.assertRoleExists(manager, roleUid)
            const organizationUids = [
                ...new Set(input.rules.flatMap(rule => rule.organizations?.map(item => assertUid(item.organizationUid, '组织UID')) ?? []))
            ]
            if (organizationUids.length) {
                const organizations = await manager.find(TbAccountOrganization, {
                    where: { uid: In(organizationUids), status: TbAccountOrganizationStatus.ENABLED }
                })
                if (organizations.length !== organizationUids.length) {
                    throw new BadRequestException('数据范围包含不存在或已禁用的组织')
                }
            }

            const previousScopes = await manager.find(TbAccountRoleDataScope, { where: { roleUid }, select: { uid: true } })
            const previousScopeUids = previousScopes.map(scope => scope.uid)
            if (previousScopeUids.length) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeUid: In(previousScopeUids) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleUid })

            for (const rule of input.rules) {
                const scope = manager.create(TbAccountRoleDataScope, {
                    uid: generateUid(),
                    roleUid,
                    resourceCode: rule.resourceCode.trim(),
                    scopeType: rule.scopeType,
                    status: rule.status
                })
                await manager.save(scope)
                if (rule.scopeType === TbAccountRoleDataScopeType.CUSTOM && rule.organizations?.length) {
                    await manager.insert(
                        TbAccountRoleDataScopeOrganization,
                        rule.organizations.map(item => ({
                            dataScopeUid: scope.uid,
                            organizationUid: item.organizationUid,
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
            const organizationUids = organizations.map(item => item.organizationUid)
            if (new Set(organizationUids).size !== organizationUids.length) {
                throw new BadRequestException(`数据范围 ${rule.resourceCode} 的组织不能重复`)
            }
        }
    }

    private async assertRoleExists(manager: EntityManager, roleUid: string): Promise<void> {
        const role = await manager.findOne(TbAccountRole, { where: { uid: roleUid }, lock: { mode: 'pessimistic_write' } })
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
    }

    private async assertSuperAdmin(actorUid: string): Promise<void> {
        if (!(await this.permissionsService.isSuperAdmin(actorUid))) {
            throw new ConflictException('只有超级管理员可以配置角色权限')
        }
    }

    private async assertCodeAvailable(manager: EntityManager, code: string, excludedUid?: string): Promise<void> {
        const query = manager.getRepository(TbAccountRole).createQueryBuilder('role').where('role.code = :code', { code: code.trim() })
        if (excludedUid) {
            query.andWhere('role.uid <> :excludedUid', { excludedUid })
        }
        if (await query.getExists()) {
            throw new ConflictException('角色编码已存在')
        }
    }
}
