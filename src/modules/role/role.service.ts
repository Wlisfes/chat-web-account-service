import { ConflictException, Injectable } from '@nestjs/common'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import { Repository, InjectRepository } from '@wlisfes/chat-web-base-schema/database'
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

    /**角色下拉列表**/
    public async httpBaseAccountSelectRole(): Promise<RoleDto.RoleResponseDto[]> {
        return this.roleUtilsService.findAll()
    }

    /**角色详情**/
    public async httpBaseAccountRoleResolver(query: RoleDto.RoleKeyDto): Promise<RoleDto.RoleResponseDto> {
        return this.roleUtilsService.findDetail(query.keyId)
    }

    /**新增角色**/
    public async httpBaseAccountCreateRole(body: RoleDto.CreateRoleDto): Promise<Schema.TbAccountRole> {
        return await this.roleRepository.manager.transaction(async manager => {
            if (body.code.trim() === 'super_admin') {
                throw new ConflictException('super_admin 是保留角色编码')
            }
            await this.roleUtilsService.findCodeAvailable(manager, body.code)
            const role = manager.create(Schema.TbAccountRole, { ...body, builtin: false })
            return manager.save(role).then(async saved => {
                await this.permissionCacheService.invalidate({ roleKeyIds: [saved.keyId] })
                return saved
            })
        })
    }

    /**编辑角色**/
    public async httpBaseAccountUpdateRole(principal: AuthPrincipal, body: RoleDto.UpdateRolePayloadDto): Promise<Schema.TbAccountRole> {
        const { keyId, ...input } = body
        return await this.roleRepository.manager.transaction(async manager => {
            const role = await this.roleUtilsService.findRequired(keyId, manager)
            if (role.builtin && isNotEmpty(input.code) && input.code !== role.code) {
                throw new ConflictException('系统内置角色不能修改编码')
            }
            if (role.builtin) {
                await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以修改系统内置角色')
            }
            if (role.code === 'super_admin' && input.status === Schema.TbAccountRoleStatus.DISABLED) {
                throw new ConflictException('超级管理员角色不能禁用')
            }
            if (isNotEmpty(input.code) && input.code !== role.code) {
                await this.roleUtilsService.findCodeAvailable(manager, input.code, keyId)
            }
            await manager.merge(Schema.TbAccountRole, role, input)
            return await manager.save(role).then(async saved => {
                await this.permissionCacheService.invalidate({ roleKeyIds: [saved.keyId] })
                return saved
            })
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

    /**替换角色菜单权限**/
    public async httpBaseAccountUpdateRoleMenu(
        principal: AuthPrincipal,
        body: RoleDto.ReplaceRoleMenusPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以配置角色权限')
        return await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findRequired(body.keyId, manager)
            await this.roleUtilsService.findMenusRequired(manager, body.menuKeyIds)
            await this.roleUtilsService.replaceRoleMenus(manager, body.keyId, body.menuKeyIds)
            await this.permissionCacheService.invalidate({ roleKeyIds: [body.keyId] })
            return { success: true }
        })
    }

    /**替换角色数据范围**/
    public async httpBaseAccountUpdateRoleDataScope(
        principal: AuthPrincipal,
        body: RoleDto.ReplaceRoleDataScopesPayloadDto
    ): Promise<SuccessResponseDataDto> {
        await this.roleUtilsService.findSuperAdminRequired(principal.uid, '只有超级管理员可以配置角色权限')
        this.roleUtilsService.findDataScopeRulesRequired(body.rules)
        return await this.roleRepository.manager.transaction(async manager => {
            await this.roleUtilsService.findRequired(body.keyId, manager)
            const organizationKeyIds = [
                ...new Set(body.rules.flatMap(rule => rule.organizations?.map(item => item.organizationKeyId) ?? []))
            ]
            await this.roleUtilsService.findOrganizationsRequired(manager, organizationKeyIds)
            await this.roleUtilsService.replaceRoleDataScopes(manager, body.keyId, body.rules)
            await this.permissionCacheService.invalidate({ roleKeyIds: [body.keyId] })
            return { success: true }
        })
    }
}
