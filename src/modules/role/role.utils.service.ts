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
    TbAccountUserRole
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from 'class-validator'
import { EntityManager, In, Repository } from 'typeorm'
import { RoleResponseDto } from '@/dto/api-response.dto'
import { PermissionService } from '@/modules/permission/permission.service'
import { RoleDataScopeRuleDto } from '@/modules/role/dto/role.dto'

@Injectable()
export class RoleUtilsService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        private readonly database: DataBaseService,
        private readonly permissionService: PermissionService
    ) {}

    /**获取角色及数据范围列表*/
    public async findAll(): Promise<RoleResponseDto[]> {
        const roles = await this.database.builder(this.roleRepository, qb =>
            qb.orderBy('t.sort', 'ASC').addOrderBy('t.keyId', 'ASC').getMany()
        )
        const roleKeyIds = roles.map(role => role.keyId)
        if (roleKeyIds.length === 0) {
            return []
        }

        const dataScopes = await this.roleRepository.manager.find(TbAccountRoleDataScope, {
            where: { roleKeyId: In(roleKeyIds) },
            order: { keyId: 'ASC' }
        })
        const dataScopeKeyIds = dataScopes.map(scope => scope.keyId)
        const scopeOrganizations =
            dataScopeKeyIds.length > 0
                ? await this.roleRepository.manager.find(TbAccountRoleDataScopeOrganization, {
                      where: { dataScopeKeyId: In(dataScopeKeyIds) },
                      order: { keyId: 'ASC' }
                  })
                : []
        const organizationsByScope = new Map<number, TbAccountRoleDataScopeOrganization[]>()
        for (const organization of scopeOrganizations) {
            const organizations = organizationsByScope.get(organization.dataScopeKeyId) ?? []
            organizations.push(organization)
            organizationsByScope.set(organization.dataScopeKeyId, organizations)
        }
        const scopesByRole = new Map<number, Array<TbAccountRoleDataScope & { organizations: TbAccountRoleDataScopeOrganization[] }>>()
        for (const scope of dataScopes) {
            const scopes = scopesByRole.get(scope.roleKeyId) ?? []
            scopes.push({ ...scope, organizations: organizationsByScope.get(scope.keyId) ?? [] })
            scopesByRole.set(scope.roleKeyId, scopes)
        }
        return roles.map(role => ({ ...role, dataScopes: scopesByRole.get(role.keyId) ?? [] }))
    }

    /**获取角色、菜单和数据范围详情*/
    public async findDetail(keyId: number): Promise<RoleResponseDto> {
        const role = await this.findRequired(keyId)
        const [menuRelations, dataScopes] = await Promise.all([
            this.roleRepository.manager.find(TbAccountRoleMenu, { where: { roleKeyId: keyId } }),
            this.roleRepository.manager.find(TbAccountRoleDataScope, { where: { roleKeyId: keyId } })
        ])
        const scopeKeyIds = dataScopes.map(scope => scope.keyId)
        const scopeOrganizations =
            scopeKeyIds.length > 0
                ? await this.roleRepository.manager.find(TbAccountRoleDataScopeOrganization, {
                      where: { dataScopeKeyId: In(scopeKeyIds) }
                  })
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

    /**获取必需的角色详情*/
    public async findRequired(keyId: number, manager?: EntityManager): Promise<TbAccountRole> {
        const role = isNotEmpty(manager)
            ? await manager.findOne(TbAccountRole, { where: { keyId }, lock: { mode: 'pessimistic_write' } })
            : await this.database.builder(this.roleRepository, qb => qb.where('t.keyId = :keyId', { keyId }).getOne())
        if (!role) {
            throw new NotFoundException('角色不存在')
        }
        return role
    }

    /**校验角色允许删除*/
    public async findDeleteAvailable(manager: EntityManager, role: TbAccountRole): Promise<void> {
        if (role.builtin) {
            throw new ConflictException('系统内置角色不能删除')
        }
        if (await manager.existsBy(TbAccountUserRole, { roleKeyId: role.keyId })) {
            throw new ConflictException('角色仍有关联用户，不能删除')
        }
    }

    /**校验操作者为超级管理员*/
    public async findSuperAdminRequired(actorUid: string, message: string): Promise<void> {
        if (!(await this.permissionService.isSuperAdmin(actorUid))) {
            throw new ConflictException(message)
        }
    }

    /**校验角色编码可用*/
    public async findCodeAvailable(manager: EntityManager, code: string, excludedKeyId?: number): Promise<void> {
        const exists = await this.database.builder(manager.getRepository(TbAccountRole), qb => {
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
    public async findMenusRequired(manager: EntityManager, menuKeyIds: number[]): Promise<void> {
        if (menuKeyIds.length === 0) return
        const menus = await manager.find(TbAccountMenu, {
            where: { keyId: In(menuKeyIds), status: TbAccountMenuStatus.ENABLED }
        })
        if (menus.length !== menuKeyIds.length) {
            throw new BadRequestException('菜单列表包含不存在或已禁用的节点')
        }
    }

    /**校验组织列表存在且已启用*/
    public async findOrganizationsRequired(manager: EntityManager, organizationKeyIds: number[]): Promise<void> {
        if (organizationKeyIds.length === 0) return
        const organizations = await manager.find(TbAccountOrganization, {
            where: { keyId: In(organizationKeyIds), status: TbAccountOrganizationStatus.ENABLED }
        })
        if (organizations.length !== organizationKeyIds.length) {
            throw new BadRequestException('数据范围包含不存在或已禁用的组织')
        }
    }

    /**校验角色数据范围规则*/
    public findDataScopeRulesRequired(rules: RoleDataScopeRuleDto[]): void {
        const resourceCodes = rules.map(rule => rule.resourceCode.trim())
        if (new Set(resourceCodes).size !== resourceCodes.length) {
            throw new BadRequestException('同一个角色的业务资源编码不能重复')
        }
        for (const rule of rules) {
            const organizations = rule.organizations ?? []
            if (rule.scopeType === TbAccountRoleDataScopeType.CUSTOM && organizations.length === 0) {
                throw new BadRequestException(`自定义数据范围 ${rule.resourceCode} 至少需要一个组织`)
            }
            if (rule.scopeType !== TbAccountRoleDataScopeType.CUSTOM && organizations.length > 0) {
                throw new BadRequestException(`非自定义数据范围 ${rule.resourceCode} 不能配置组织列表`)
            }
            const organizationKeyIds = organizations.map(item => item.organizationKeyId)
            if (new Set(organizationKeyIds).size !== organizationKeyIds.length) {
                throw new BadRequestException(`数据范围 ${rule.resourceCode} 的组织不能重复`)
            }
        }
    }
}
