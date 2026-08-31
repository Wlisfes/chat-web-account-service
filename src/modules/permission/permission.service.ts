import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    TbAccountMenu,
    TbAccountMenuStatus,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleDataScopeStatus,
    TbAccountRoleDataScopeType,
    TbAccountRoleMenu,
    TbAccountUserOrganization,
    TbAccountUserOrganizationStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, buildTree } from '@wlisfes/chat-web-base-schema/utils'
import { isEmpty, isNotEmpty } from 'class-validator'
import { In, Repository } from 'typeorm'
import * as PermissionDto from '@/modules/permission/dto/permission.dto'
import { EffectiveAccess, EffectiveDataScope } from '@/modules/permission/permission.interface'
import { selectEffectiveScopeRules } from '@/modules/permission/permission.policy'
import { PermissionUtilsService } from '@/modules/permission/permission.utils.service'

const SUPER_ADMIN_ROLE_CODE = 'super_admin'
const DEFAULT_RESOURCE_CODE = '*'

@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(TbAccountMenu) private readonly menuRepository: Repository<TbAccountMenu>,
        @InjectRepository(TbAccountRoleDataScope) private readonly dataScopeRepository: Repository<TbAccountRoleDataScope>,
        @InjectRepository(TbAccountUserOrganization) private readonly userOrganizationRepository: Repository<TbAccountUserOrganization>,
        private readonly database: DataBaseService,
        private readonly permissionUtilsService: PermissionUtilsService
    ) {}

    /**当前账号有效权限*/
    public async httpBaseAccountPermissionResolver(principal: AuthPrincipal): Promise<EffectiveAccess> {
        const roles = await this.permissionUtilsService.getEnabledRoles(assertUid(principal.uid, '账号UID'))
        const superAdmin = roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)
        const allEnabledMenus = await this.database.builder(this.menuRepository, qb =>
            qb
                .where('t.status = :status', { status: TbAccountMenuStatus.ENABLED })
                .orderBy('t.sort', 'ASC')
                .addOrderBy('t.keyId', 'ASC')
                .getMany()
        )

        let explicitlyGrantedMenus: TbAccountMenu[]
        if (superAdmin) {
            explicitlyGrantedMenus = allEnabledMenus
        } else if (roles.length > 0) {
            const relations = await this.menuRepository.manager.find(TbAccountRoleMenu, {
                where: { roleKeyId: In(roles.map(role => role.keyId)) }
            })
            const grantedKeyIds = new Set(relations.map(relation => relation.menuKeyId))
            explicitlyGrantedMenus = allEnabledMenus.filter(menu => grantedKeyIds.has(menu.keyId))
        } else {
            explicitlyGrantedMenus = []
        }

        const treeMenuKeyIds = this.permissionUtilsService.includeMenuAncestors(explicitlyGrantedMenus, allEnabledMenus)
        const menuTree = buildTree(allEnabledMenus.filter(menu => treeMenuKeyIds.has(menu.keyId)))
        return {
            superAdmin,
            roleCodes: roles.map(role => role.code).sort(),
            permissionCodes: [
                ...new Set(
                    explicitlyGrantedMenus.map(menu => menu.permissionCode?.trim()).filter((value): value is string => isNotEmpty(value))
                )
            ].sort(),
            menuTree
        }
    }

    /**当前账号指定资源数据范围*/
    public async httpBaseAccountPermissionDataScope(
        principal: AuthPrincipal,
        query: PermissionDto.PermissionDataScopeQueryDto
    ): Promise<EffectiveDataScope> {
        return this.resolveDataScope(principal.uid, query.resourceCode)
    }

    /**校验账号是否拥有全部指定权限码*/
    public async hasPermission(userUid: string, requiredPermissionCodes: string[]): Promise<boolean> {
        if (requiredPermissionCodes.length === 0) {
            return true
        }
        const roles = await this.permissionUtilsService.getEnabledRoles(assertUid(userUid, '账号UID'))
        if (roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)) {
            return true
        }
        if (roles.length === 0) {
            return false
        }

        const permissionRows = await this.database.builder(this.menuRepository, qb =>
            qb
                .select('DISTINCT t.permission_code', 'permissionCode')
                .innerJoin(TbAccountRoleMenu, 'role_menu', 'role_menu.menu_key_id = t.key_id')
                .where('role_menu.role_key_id IN (:...roleKeyIds)', { roleKeyIds: roles.map(role => role.keyId) })
                .andWhere('t.status = :menuStatus', { menuStatus: TbAccountMenuStatus.ENABLED })
                .andWhere('t.permission_code IN (:...permissionCodes)', { permissionCodes: requiredPermissionCodes })
                .getRawMany<{ permissionCode: string }>()
        )
        const granted = new Set(permissionRows.map(row => row.permissionCode))
        return [...new Set(requiredPermissionCodes)].every(permissionCode => granted.has(permissionCode))
    }

    /**判断账号是否为超级管理员*/
    public async isSuperAdmin(userUid: string): Promise<boolean> {
        const roles = await this.permissionUtilsService.getEnabledRoles(assertUid(userUid, '账号UID'))
        return roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)
    }

    /**解析账号对指定业务资源的有效数据范围*/
    public async resolveDataScope(userUid: string, resourceCode: string): Promise<EffectiveDataScope> {
        const normalizedUserUid = assertUid(userUid, '账号UID')
        const normalizedResourceCode = resourceCode.trim()
        if (normalizedResourceCode.length > 128) {
            return { all: false, includeSelf: false, organizationKeyIds: [] }
        }
        const roles = await this.permissionUtilsService.getEnabledRoles(normalizedUserUid)
        if (roles.some(role => role.code === SUPER_ADMIN_ROLE_CODE)) {
            return { all: true, includeSelf: true, organizationKeyIds: [] }
        }
        if (roles.length === 0 || isEmpty(normalizedResourceCode)) {
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
            ;(await this.permissionUtilsService.expandOrganizationTrees(primaryOrganizationKeyIds)).forEach(keyId =>
                organizationKeyIds.add(keyId)
            )
        }

        const customScopes = selectedScopes.filter(scope => scope.scopeType === TbAccountRoleDataScopeType.CUSTOM)
        if (customScopes.length > 0) {
            const grants = await this.dataScopeRepository.manager.find(TbAccountRoleDataScopeOrganization, {
                where: { dataScopeKeyId: In(customScopes.map(scope => scope.keyId)) }
            })
            const directOrganizationKeyIds = grants.filter(grant => !grant.includeChildren).map(grant => grant.organizationKeyId)
            directOrganizationKeyIds.forEach(keyId => organizationKeyIds.add(keyId))
            const treeRootKeyIds = grants.filter(grant => grant.includeChildren).map(grant => grant.organizationKeyId)
            ;(await this.permissionUtilsService.expandOrganizationTrees(treeRootKeyIds)).forEach(keyId => organizationKeyIds.add(keyId))
        }

        return { all: false, includeSelf, organizationKeyIds: [...organizationKeyIds].sort((left, right) => left - right) }
    }
}
