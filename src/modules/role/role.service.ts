import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import {
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleDataScopeType,
    TbAccountRoleMenu,
    TbAccountRoleStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { isNotEmpty } from 'class-validator'
import { In, Repository } from 'typeorm'
import { RoleResponseDto } from '@/dto/api-response.dto'
import * as RoleDto from '@/modules/role/dto/role.dto'
import { RoleUtilsService } from '@/modules/role/role.utils.service'

@Injectable()
export class RoleService {
    constructor(
        @InjectRepository(TbAccountRole) private readonly roleRepository: Repository<TbAccountRole>,
        private readonly roleUtilsService: RoleUtilsService
    ) {}

    /**角色下拉列表*/
    public async httpBaseAccountSelectRole(): Promise<RoleResponseDto[]> {
        return this.roleUtilsService.findAll()
    }

    /**角色详情*/
    public async httpBaseAccountRoleResolver(query: RoleDto.RoleKeyDto): Promise<RoleResponseDto> {
        return this.roleUtilsService.findDetail(query.keyId)
    }

    /**新增角色*/
    public async httpBaseAccountCreateRole(input: RoleDto.CreateRoleDto): Promise<TbAccountRole> {
        if (input.code.trim() === 'super_admin') {
            throw new ConflictException('super_admin 是保留角色编码')
        }
        return this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findCodeAvailable(manager, input.code)
            const role = manager.create(TbAccountRole, { ...input, builtin: false })
            return manager.save(role)
        })
    }

    /**编辑角色*/
    public async httpBaseAccountUpdateRole(principal: AuthPrincipal, input: RoleDto.UpdateRolePayloadDto): Promise<TbAccountRole> {
        const { keyId, ...fields } = input
        return this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(keyId, manager)
            if (role.builtin && isNotEmpty(fields.code) && fields.code !== role.code) {
                throw new ConflictException('系统内置角色不能修改编码')
            }
            if (role.builtin) {
                await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以修改系统内置角色')
            }
            if (role.code === 'super_admin' && fields.status === TbAccountRoleStatus.DISABLED) {
                throw new ConflictException('超级管理员角色不能禁用')
            }
            if (isNotEmpty(fields.code) && fields.code !== role.code) {
                await this.roleUtilsService.findCodeAvailable(manager, fields.code, keyId)
            }
            manager.merge(TbAccountRole, role, fields)
            return manager.save(role)
        })
    }

    /**删除角色*/
    public async httpBaseAccountDeleteRole(input: RoleDto.RoleKeyDto): Promise<SuccessResponseDataDto> {
        await this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(input.keyId, manager)
            await this.roleUtilsService.findDeleteAvailable(manager, role)
            const scopes = await manager.find(TbAccountRoleDataScope, {
                where: { roleKeyId: input.keyId },
                select: { keyId: true }
            })
            const scopeKeyIds = scopes.map(scope => scope.keyId)
            if (scopeKeyIds.length > 0) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(scopeKeyIds) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleKeyId: input.keyId })
            await manager.delete(TbAccountRoleMenu, { roleKeyId: input.keyId })
            await manager.delete(TbAccountRole, { keyId: input.keyId })
        })
        return { success: true }
    }

    /**替换角色菜单权限*/
    public async httpBaseAccountUpdateRoleMenu(
        principal: AuthPrincipal,
        input: RoleDto.ReplaceRoleMenusPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以配置角色权限')
        await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findRequired(input.keyId, manager)
            await this.roleUtilsService.findMenusRequired(manager, input.menuKeyIds)
            await manager.delete(TbAccountRoleMenu, { roleKeyId: input.keyId })
            if (input.menuKeyIds.length > 0) {
                await manager.insert(
                    TbAccountRoleMenu,
                    input.menuKeyIds.map(menuKeyId => ({ roleKeyId: input.keyId, menuKeyId }))
                )
            }
        })
        return { success: true }
    }

    /**替换角色数据范围*/
    public async httpBaseAccountUpdateRoleDataScope(
        principal: AuthPrincipal,
        input: RoleDto.ReplaceRoleDataScopesPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以配置角色权限')
        this.roleUtilsService.findDataScopeRulesRequired(input.rules)
        await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findRequired(input.keyId, manager)
            const organizationKeyIds = [
                ...new Set(input.rules.flatMap(rule => rule.organizations?.map(item => item.organizationKeyId) ?? []))
            ]
            await this.roleUtilsService.findOrganizationsRequired(manager, organizationKeyIds)

            const previousScopes = await manager.find(TbAccountRoleDataScope, {
                where: { roleKeyId: input.keyId },
                select: { keyId: true }
            })
            const previousScopeKeyIds = previousScopes.map(scope => scope.keyId)
            if (previousScopeKeyIds.length > 0) {
                await manager.delete(TbAccountRoleDataScopeOrganization, { dataScopeKeyId: In(previousScopeKeyIds) })
            }
            await manager.delete(TbAccountRoleDataScope, { roleKeyId: input.keyId })

            for (const rule of input.rules) {
                const scope = manager.create(TbAccountRoleDataScope, {
                    roleKeyId: input.keyId,
                    resourceCode: rule.resourceCode.trim(),
                    scopeType: rule.scopeType,
                    status: rule.status
                })
                await manager.save(scope)
                if (rule.scopeType === TbAccountRoleDataScopeType.CUSTOM && (rule.organizations?.length ?? 0) > 0) {
                    await manager.insert(
                        TbAccountRoleDataScopeOrganization,
                        rule.organizations?.map(item => ({
                            dataScopeKeyId: scope.keyId,
                            organizationKeyId: item.organizationKeyId,
                            includeChildren: item.includeChildren
                        })) ?? []
                    )
                }
            }
        })
        return { success: true }
    }
}
