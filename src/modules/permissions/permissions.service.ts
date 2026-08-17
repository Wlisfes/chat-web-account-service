import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    TbAccountMenu,
    TbAccountMenuStatus,
    TbAccountOrganizationClosure,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleDataScopeStatus,
    TbAccountRoleDataScopeType,
    TbAccountRoleMenu,
    TbAccountRoleStatus,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus,
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { In, Repository } from 'typeorm'
import { assertUid } from '@/common/uid'
import { buildTree } from '@/common/tree'
import { EffectiveAccess, EffectiveDataScope } from '@/modules/permissions/permissions.interface'
import { selectEffectiveScopeRules } from '@/modules/permissions/permissions.policy'

const SUPER_ADMIN_ROLE_CODE = 'super_admin'
const DEFAULT_RESOURCE_CODE = '*'

@Injectable()
export class PermissionsService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        @InjectRepository(TbAccountRoleDataScope) private readonly dataScopeRepository: Repository<TbAccountRoleDataScope>,
        @InjectRepository(TbAccountUserOrganization) private readonly userOrganizationRepository: Repository<TbAccountUserOrganization>
    ) {}

    async getEffectiveAccess(userUid: string): Promise<EffectiveAccess> {
        const roles = await this.getEnabledRoles(assertUid(userUid, '账号UID'))
        const superAdmin = roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)
        const allEnabledMenus = await this.menuRepository.find({
            where: { status: TbAccountMenuStatus.ENABLED },
            order: { sort: 'ASC', keyId: 'ASC' }
        })

        let explicitlyGrantedMenus: TbAccountMenu[]
        if (superAdmin) {
            explicitlyGrantedMenus = allEnabledMenus
        } else if (roles.length) {
            const relations = await this.menuRepository.manager.find(TbAccountRoleMenu, {
                where: { roleKeyId: In(roles.map(role => role.keyId)) }
            })
            const grantedKeyIds = new Set(relations.map(relation => relation.menuKeyId))
            explicitlyGrantedMenus = allEnabledMenus.filter(menu => grantedKeyIds.has(menu.keyId))
        } else {
            explicitlyGrantedMenus = []
        }

        const treeMenuKeyIds = this.includeMenuAncestors(explicitlyGrantedMenus, allEnabledMenus)
        const menuTree = buildTree(allEnabledMenus.filter(menu => treeMenuKeyIds.has(menu.keyId)))
        return {
            superAdmin,
            roleCodes: roles.map(role => role.code).sort(),
            permissionCodes: [
                ...new Set(
                    explicitlyGrantedMenus.map(menu => menu.permissionCode?.trim()).filter((value): value is string => Boolean(value))
                )
            ].sort(),
            menuTree
        }
    }

    async hasPermission(userUid: string, requiredPermissionCodes: string[]): Promise<boolean> {
        if (!requiredPermissionCodes.length) {
            return true
        }
        const roles = await this.getEnabledRoles(assertUid(userUid, '账号UID'))
        if (roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)) {
            return true
        }
        if (!roles.length) {
            return false
        }

        const permissionRows = await this.menuRepository
            .createQueryBuilder('menu')
            .select('DISTINCT menu.permission_code', 'permissionCode')
            .innerJoin(TbAccountRoleMenu, 'role_menu', 'role_menu.menu_key_id = menu.key_id')
            .where('role_menu.role_key_id IN (:...roleKeyIds)', { roleKeyIds: roles.map(role => role.keyId) })
            .andWhere('menu.status = :menuStatus', { menuStatus: TbAccountMenuStatus.ENABLED })
            .andWhere('menu.permission_code IN (:...permissionCodes)', { permissionCodes: requiredPermissionCodes })
            .getRawMany<{ permissionCode: string }>()
        const granted = new Set(permissionRows.map(row => row.permissionCode))
        return [...new Set(requiredPermissionCodes)].every(permissionCode => granted.has(permissionCode))
    }

    async isSuperAdmin(userUid: string): Promise<boolean> {
        const roles = await this.getEnabledRoles(assertUid(userUid, '账号UID'))
        return roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)
    }

    async resolveDataScope(userUid: string, resourceCode: string): Promise<EffectiveDataScope> {
        const normalizedUserUid = assertUid(userUid, '账号UID')
        const normalizedResourceCode = resourceCode.trim()
        if (normalizedResourceCode.length > 128) {
            return { all: false, includeSelf: false, organizationKeyIds: [] }
        }
        const roles = await this.getEnabledRoles(normalizedUserUid)
        if (roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)) {
            return { all: true, includeSelf: true, organizationKeyIds: [] }
        }
        if (!roles.length || !normalizedResourceCode) {
            return { all: false, includeSelf: false, organizationKeyIds: [] }
        }

        const scopes = await this.dataScopeRepository.find({
            where: {
                roleKeyId: In(roles.map(role => role.keyId)),
                resourceCode: In([normalizedResourceCode, DEFAULT_RESOURCE_CODE]),
                status: TbAccountRoleDataScopeStatus.ENABLED
            }
        })
        const selectedScopes = selectEffectiveScopeRules(roles, scopes, normalizedResourceCode, DEFAULT_RESOURCE_CODE)

        if (selectedScopes.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ALL)) {
            return { all: true, includeSelf: true, organizationKeyIds: [] }
        }

        const includeSelf = selectedScopes.some(scope => scope.scopeType === TbAccountRoleDataScopeType.SELF)
        const organizationKeyIds = new Set<number>()
        const primaryOrganizations = await this.userOrganizationRepository.find({
            where: {
                userUid: normalizedUserUid,
                isPrimary: true,
                status: TbAccountUserOrganizationStatus.ENABLED
            }
        })
        const primaryOrganizationKeyIds = primaryOrganizations.map(item => item.organizationKeyId)

        if (selectedScopes.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ORGANIZATION)) {
            primaryOrganizationKeyIds.forEach(keyId => organizationKeyIds.add(keyId))
        }
        if (selectedScopes.some(scope => scope.scopeType === TbAccountRoleDataScopeType.ORGANIZATION_TREE)) {
            ;(await this.expandOrganizationTrees(primaryOrganizationKeyIds)).forEach(keyId => organizationKeyIds.add(keyId))
        }

        const customScopes = selectedScopes.filter(scope => scope.scopeType === TbAccountRoleDataScopeType.CUSTOM)
        if (customScopes.length) {
            const grants = await this.dataScopeRepository.manager.find(TbAccountRoleDataScopeOrganization, {
                where: { dataScopeKeyId: In(customScopes.map(scope => scope.keyId)) }
            })
            const directOrganizationKeyIds = grants.filter(grant => !grant.includeChildren).map(grant => grant.organizationKeyId)
            directOrganizationKeyIds.forEach(keyId => organizationKeyIds.add(keyId))
            const treeRootKeyIds = grants.filter(grant => grant.includeChildren).map(grant => grant.organizationKeyId)
            ;(await this.expandOrganizationTrees(treeRootKeyIds)).forEach(keyId => organizationKeyIds.add(keyId))
        }

        return { all: false, includeSelf, organizationKeyIds: [...organizationKeyIds].sort((left, right) => left - right) }
    }

    private async getEnabledRoles(userUid: string): Promise<TbAccountRole[]> {
        const relations = await this.roleRepository.manager.find(TbAccountUserRole, { where: { userUid } })
        if (!relations.length) {
            return []
        }
        return this.roleRepository.find({
            where: { keyId: In(relations.map(relation => relation.roleKeyId)), status: TbAccountRoleStatus.ENABLED },
            order: { sort: 'ASC', keyId: 'ASC' }
        })
    }

    private includeMenuAncestors(grantedMenus: TbAccountMenu[], allMenus: TbAccountMenu[]): Set<number> {
        const byKeyId = new Map(allMenus.map(menu => [menu.keyId, menu]))
        const result = new Set<number>()
        for (const menu of grantedMenus) {
            let current: TbAccountMenu | undefined = menu
            while (current && !result.has(current.keyId)) {
                result.add(current.keyId)
                current = current.parentKeyId ? byKeyId.get(current.parentKeyId) : undefined
            }
        }
        return result
    }

    private async expandOrganizationTrees(rootKeyIds: number[]): Promise<number[]> {
        if (!rootKeyIds.length) {
            return []
        }
        const rows = await this.dataScopeRepository.manager.find(TbAccountOrganizationClosure, {
            where: { ancestorKeyId: In([...new Set(rootKeyIds)]) }
        })
        return [...new Set(rows.map(row => row.descendantKeyId))]
    }
}
