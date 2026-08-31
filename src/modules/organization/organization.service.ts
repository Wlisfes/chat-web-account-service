import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TbAccountOrganization } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { isNotEmpty } from 'class-validator'
import { Repository } from 'typeorm'
import { OrganizationTreeNodeResponseDto } from '@/dto/api-response.dto'
import * as OrganizationDto from '@/modules/organization/dto/organization.dto'
import { OrganizationUtilsService } from '@/modules/organization/organization.utils.service'

@Injectable()
export class OrganizationService {
    constructor(
        @InjectRepository(TbAccountOrganization) private readonly organizationRepository: Repository<TbAccountOrganization>,
        private readonly organizationUtilsService: OrganizationUtilsService
    ) {}

    /**组织树结构*/
    public async httpBaseAccountOrganizationTree(): Promise<OrganizationTreeNodeResponseDto[]> {
        return this.organizationUtilsService.findTree()
    }

    /**组织详情*/
    public async httpBaseAccountOrganizationResolver(query: OrganizationDto.OrganizationKeyDto): Promise<TbAccountOrganization> {
        return this.organizationUtilsService.findRequired(query.keyId)
    }

    /**新增组织*/
    public async httpBaseAccountCreateOrganization(input: OrganizationDto.CreateOrganizationDto): Promise<TbAccountOrganization> {
        return this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.lockTree(manager)
            const parentKeyId = input.parentKeyId ?? null
            await this.organizationUtilsService.findReferencesRequired(manager, parentKeyId, input.leaderUserUid)
            await this.organizationUtilsService.findCodeAvailable(manager, input.code)
            const organization = manager.create(TbAccountOrganization, {
                ...input,
                parentKeyId: parentKeyId as unknown as number
            })
            const saved = await manager.save(organization)
            await this.organizationUtilsService.rebuildClosure(manager)
            return saved
        })
    }

    /**编辑组织*/
    public async httpBaseAccountUpdateOrganization(input: OrganizationDto.UpdateOrganizationPayloadDto): Promise<TbAccountOrganization> {
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

            manager.merge(TbAccountOrganization, organization, fields, { parentKeyId: nextParentKeyId as unknown as number })
            await manager.save(organization)
            await this.organizationUtilsService.rebuildClosure(manager)
            return organization
        })
    }

    /**删除组织*/
    public async httpBaseAccountDeleteOrganization(input: OrganizationDto.OrganizationKeyDto): Promise<SuccessResponseDataDto> {
        await this.organizationRepository.manager.transaction(async manager => {
            await this.organizationUtilsService.lockTree(manager)
            await this.organizationUtilsService.findRequired(input.keyId, manager)
            await this.organizationUtilsService.findDeleteAvailable(manager, input.keyId)
            await this.organizationUtilsService.removeDepartmentRoles(manager, input.keyId)
            await this.organizationUtilsService.removeOrganization(manager, input.keyId)
            await this.organizationUtilsService.rebuildClosure(manager)
        })
        return { success: true }
    }
}
