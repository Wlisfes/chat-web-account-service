import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import { In, Repository, InjectRepository } from '@wlisfes/chat-web-base-schema/database'
import { AuthorizationService, type AuthPrincipal } from '@wlisfes/chat-web-base-schema/auth'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { RoleUtilsService } from '@/modules/role/role.utils.service'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as RoleDto from '@/modules/role/dto/role.dto'

@Injectable()
export class RoleService {
    constructor(
        @InjectRepository(Schema.TbAccountRole) private readonly roleRepository: Repository<Schema.TbAccountRole>,
        private readonly roleUtilsService: RoleUtilsService,
        private readonly permissionCacheService: AuthorizationService
    ) {}

    /**角色静态枚举**/
    public async httpBaseAccountRoleEnums(): Promise<RoleDto.RoleEnumsResponseDto> {
        return {
            statusOptions: Schema.TbAccountRoleStatusDefinition.options,
            scopeTypeOptions: Schema.TbAccountRoleDataScopeTypeDefinition.options,
            scopeStatusOptions: Schema.TbAccountRoleDataScopeStatusDefinition.options
        }
    }

    /**通用角色列表和岗位角色树**/
    public async httpBaseAccountRoleConfiger(): Promise<RoleDto.RoleConfigerResponseDto> {
        return this.roleUtilsService.findConfiger()
    }

    /**角色详情**/
    public async httpBaseAccountRoleResolver(query: RoleDto.RoleKeyDto): Promise<RoleDto.RoleResponseDto> {
        return this.roleUtilsService.findDetail(query.keyId)
    }

    /**新增角色**/
    public async httpBaseAccountCreateRole(principal: AuthPrincipal, body: RoleDto.CreateRoleDto): Promise<Schema.TbAccountRole> {
        const { dataScopes, ...input } = body
        await this.roleUtilsService.findDataScopesRequired(principal, dataScopes)
        const saved = await this.roleRepository.manager.transaction(async manager => {
            if (input.code.trim() === 'super_admin') {
                throw new ConflictException('super_admin 是保留角色编码')
            }
            await this.roleUtilsService.findCodeAvailable(manager, input.code)
            await this.roleUtilsService.findDataScopeOrganizationsRequired(manager, dataScopes)
            const role = await manager.save(manager.create(Schema.TbAccountRole, { ...input, builtin: false }))
            await this.roleUtilsService.replaceRoleDataScopes(manager, role.keyId, dataScopes)
            return role
        })
        await this.permissionCacheService.invalidate({ roleKeyIds: [saved.keyId] })
        return saved
    }

    /**编辑角色**/
    public async httpBaseAccountUpdateRole(principal: AuthPrincipal, body: RoleDto.UpdateRolePayloadDto): Promise<Schema.TbAccountRole> {
        const { keyId, dataScopes, ...input } = body
        await this.roleUtilsService.findDataScopesRequired(principal, dataScopes)
        const saved = await this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(keyId, manager)
            if (role.builtin && isNotEmpty(input.code) && input.code !== role.code) {
                throw new ConflictException('系统内置角色不能修改编码')
            }
            if (role.builtin) {
                await this.roleUtilsService.findSuperAdminRequired(principal, '只有超级管理员可以修改系统内置角色')
            }
            if (role.code === 'super_admin' && input.status === Schema.TbAccountRoleStatus.DISABLED) {
                throw new ConflictException('超级管理员角色不能禁用')
            }
            if (isNotEmpty(input.code) && input.code !== role.code) {
                await this.roleUtilsService.findCodeAvailable(manager, input.code, keyId)
            }
            await this.roleUtilsService.findDataScopeOrganizationsRequired(manager, dataScopes)
            await manager.merge(Schema.TbAccountRole, role, input)
            const updated = await manager.save(role)
            if (isNotEmpty(dataScopes)) {
                await this.roleUtilsService.replaceRoleDataScopes(manager, keyId, dataScopes)
            }
            return updated
        })
        await this.permissionCacheService.invalidate({ roleKeyIds: [saved.keyId] })
        return saved
    }

    /**批量更新角色排序；排序只影响展示顺序，不涉及权限，因此不刷新权限缓存**/
    public async httpBaseAccountUpdateRoleSort(body: RoleDto.UpdateRoleSortPayloadDto): Promise<SuccessResponseDataDto> {
        const keyIds = [...new Set(body.list.map(item => item.keyId))]
        if (keyIds.length !== body.list.length) {
            throw new BadRequestException('角色主键不能重复')
        }
        return await this.roleRepository.manager.transaction(async manager => {
            const total = await manager.count(Schema.TbAccountRole, { where: { keyId: In(keyIds) } })
            if (total !== keyIds.length) {
                throw new NotFoundException('角色不存在')
            }
            for (const item of body.list) {
                await manager.update(Schema.TbAccountRole, { keyId: item.keyId }, { sort: item.sort })
            }
            return { success: true }
        })
    }

    /**删除角色**/
    public async httpBaseAccountDeleteRole(body: RoleDto.RoleKeyDto): Promise<SuccessResponseDataDto> {
        return await this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(body.keyId, manager)
            await this.roleUtilsService.findDeleteAvailable(manager, role)
            await this.roleUtilsService.clearRoleRelations(manager, body.keyId)
            await manager.delete(Schema.TbAccountRole, { keyId: body.keyId })
            await this.permissionCacheService.invalidate({ roleKeyIds: [body.keyId] })
            return { success: true }
        })
    }

    /**批量关联角色用户**/
    public async httpBaseAccountRoleLinkUser(principal: AuthPrincipal, body: RoleDto.RoleUserPayloadDto): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal, '只有超级管理员可以分配用户角色')
        const uids = this.roleUtilsService.findUidsRequired(body.uids)
        await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findEnabledRequired(manager, body.keyId)
            await this.roleUtilsService.findUsersRequired(manager, uids)
            await this.roleUtilsService.insertRoleUsers(manager, body.keyId, uids)
        })
        await this.permissionCacheService.invalidate({ uids })
        return { success: true }
    }

    /**批量移除角色用户**/
    public async httpBaseAccountRoleUnlinkUser(
        principal: AuthPrincipal,
        body: RoleDto.RoleUserPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal, '只有超级管理员可以移除用户角色')
        const uids = this.roleUtilsService.findUidsRequired(body.uids)
        await this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(body.keyId, manager)
            await this.roleUtilsService.findUsersRequired(manager, uids)
            await this.roleUtilsService.deleteRoleUsers(manager, role, uids)
        })
        await this.permissionCacheService.invalidate({ uids })
        return { success: true }
    }

    /**替换角色菜单权限**/
    public async httpBaseAccountUpdateRoleSheet(
        principal: AuthPrincipal,
        body: RoleDto.ReplaceRoleSheetsPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal, '只有超级管理员可以配置角色权限')
        return await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findRequired(body.keyId, manager)
            await this.roleUtilsService.findSheetsRequired(manager, body.sheetKeyIds)
            await this.roleUtilsService.replaceRoleSheets(manager, body.keyId, body.sheetKeyIds)
            await this.permissionCacheService.invalidate({ roleKeyIds: [body.keyId] })
            return { success: true }
        })
    }
}
