import { BadRequestException, Injectable } from '@nestjs/common'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { assertUid, isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import { OrganizationUtilsService } from '@/modules/organization/organization.utils.service'
import * as OrganizationDto from '@/modules/organization/dto/organization.dto'
import * as Schema from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

@Injectable()
export class OrganizationService {
    constructor(
        @InjectRepository(Schema.TbAccountOrganization) private readonly organizationRepository: Repository<Schema.TbAccountOrganization>,
        private readonly organizationUtilsService: OrganizationUtilsService
    ) {}

    /**组织静态枚举*/
    public async httpBaseAccountOrganizationEnums(): Promise<OrganizationDto.OrganizationEnumsResponseDto> {
        return {
            typeOptions: Schema.TbAccountOrganizationTypeDefinition.options,
            statusOptions: Schema.TbAccountOrganizationStatusDefinition.options
        }
    }

    /**组织树结构；传入 keyId 时只返回该组织的下级子树*/
    public async httpBaseAccountOrganizationTreeStructure(
        query: OrganizationDto.OrganizationTreeQueryDto
    ): Promise<OrganizationDto.OrganizationTreeNodeResponseDto[]> {
        return this.organizationUtilsService.findTree(query.keyId)
    }

    /**带启用成员的组织树结构*/
    public async httpBaseAccountOrganizationTreeUser(): Promise<OrganizationDto.OrganizationUserNodeResponseDto[]> {
        return this.organizationUtilsService.findOrganizationUser()
    }

    /**组织详情*/
    public async httpBaseAccountOrganizationResolver(query: OrganizationDto.OrganizationKeyDto): Promise<Schema.TbAccountOrganization> {
        return this.organizationUtilsService.findRequired(query.keyId)
    }

    /**指定组织的直接启用成员*/
    public async httpBaseAccountOrganizationColumnUser(
        query: OrganizationDto.OrganizationKeyDto
    ): Promise<OrganizationDto.OrganizationUserResponseDto[]> {
        return this.organizationUtilsService.findOrganizationMembers(query.keyId)
    }

    /**新增组织*/
    public async httpBaseAccountCreateOrganization(input: OrganizationDto.CreateOrganizationDto): Promise<Schema.TbAccountOrganization> {
        return this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.lockTree(manager)
            const parentKeyId = input.parentKeyId ?? null
            await this.organizationUtilsService.findReferencesRequired(manager, parentKeyId, input.leaderUserUid)
            await this.organizationUtilsService.findCodeAvailable(manager, input.code)
            const organization = manager.create(Schema.TbAccountOrganization, {
                ...input,
                parentKeyId: parentKeyId as unknown as number
            })
            const saved = await manager.save(organization)
            await this.organizationUtilsService.ensureLeaderMembership(manager, saved.keyId, saved.leaderUserUid)
            await this.organizationUtilsService.rebuildClosure(manager)
            return saved
        })
    }

    /**编辑组织*/
    public async httpBaseAccountUpdateOrganization(
        input: OrganizationDto.UpdateOrganizationPayloadDto
    ): Promise<Schema.TbAccountOrganization> {
        const { keyId, ...fields } = input
        return this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.lockTree(manager)
            const organization = await this.organizationUtilsService.findRequired(keyId, manager)

            // parentKeyId 是三态字段：undefined 保持原父级，null 显式移动到顶层，数字表示移动到指定父级。
            const nextParentKeyId = fields.parentKeyId === undefined ? organization.parentKeyId : (fields.parentKeyId ?? null)
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('组织不能成为自己的父节点')
            }
            await this.organizationUtilsService.findReferencesRequired(manager, nextParentKeyId, fields.leaderUserUid)
            if (isNotEmpty(fields.code) && fields.code !== organization.code) {
                await this.organizationUtilsService.findCodeAvailable(manager, fields.code, keyId)
            }

            manager.merge(Schema.TbAccountOrganization, organization, fields, { parentKeyId: nextParentKeyId as unknown as number })
            await manager.save(organization)
            await this.organizationUtilsService.ensureLeaderMembership(manager, organization.keyId, organization.leaderUserUid)
            await this.organizationUtilsService.rebuildClosure(manager)
            return organization
        })
    }

    /**删除组织*/
    public async httpBaseAccountDeleteOrganization(input: OrganizationDto.OrganizationKeyDto): Promise<SuccessResponseDataDto> {
        return await this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.lockTree(manager)
            await this.organizationUtilsService.findRequired(input.keyId, manager)
            await this.organizationUtilsService.findDeleteAvailable(manager, input.keyId)
            await this.organizationUtilsService.removeDepartmentRoles(manager, input.keyId)
            await this.organizationUtilsService.removeOrganization(manager, input.keyId)
            await this.organizationUtilsService.rebuildClosure(manager)
            return { success: true }
        })
    }

    /**按账号UID全集同步组织成员，多出的新增、缺少的移除*/
    public async httpBaseAccountUpdateOrganizationUser(input: OrganizationDto.UpdateOrganizationUsersDto): Promise<SuccessResponseDataDto> {
        const uids = [...new Set(input.uids.map(uid => assertUid(uid, '账号UID')))]
        const desired = new Set(uids)
        return await this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.findRequired(input.organizationKeyId, manager)
            const current = await manager.find(Schema.TbAccountUserOrganization, { where: { organizationKeyId: input.organizationKeyId } })
            const toAdd = uids.filter(uid => {
                const membership = current.find(item => item.userUid === uid)
                return !membership || membership.status !== Schema.TbAccountUserOrganizationStatus.ENABLED
            })
            const toRemove = [...new Set(current.map(item => item.userUid))].filter(uid => !desired.has(uid))
            if (toAdd.length === 0 && toRemove.length === 0) {
                return { success: true }
            }
            for (const uid of toAdd) {
                await this.organizationUtilsService.ensureUserMembership(manager, input.organizationKeyId, uid)
            }
            for (const uid of toRemove) {
                await this.organizationUtilsService.removeUserMembership(manager, input.organizationKeyId, uid)
            }
            return { success: true }
        })
    }
}
