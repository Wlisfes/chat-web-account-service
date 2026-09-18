import { BadRequestException, Injectable } from '@nestjs/common'
import { SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { InjectRepository, Repository } from '@wlisfes/chat-web-base-schema/database'
import { isNotEmpty } from '@wlisfes/chat-web-base-schema/utils'
import { DeptUtilsService } from '@/modules/dept/dept.utils.service'
import * as Schema from '@wlisfes/chat-web-base-schema'
import * as DeptDto from '@/modules/dept/dto/dept.dto'

@Injectable()
export class DeptService {
    constructor(
        @InjectRepository(Schema.TbAccountOrganization) private readonly deptRepository: Repository<Schema.TbAccountOrganization>,
        private readonly deptUtilsService: DeptUtilsService
    ) {}

    /**组织树结构*/
    public async httpBaseAccountDeptTree(): Promise<DeptDto.DeptTreeNodeResponseDto[]> {
        return this.deptUtilsService.findTree()
    }

    /**组织详情*/
    public async httpBaseAccountDeptResolver(query: DeptDto.DeptKeyDto): Promise<Schema.TbAccountOrganization> {
        return this.deptUtilsService.findRequired(query.keyId)
    }

    /**新增组织*/
    public async httpBaseAccountCreateDept(input: DeptDto.CreateDeptDto): Promise<Schema.TbAccountOrganization> {
        return this.deptRepository.manager.transaction(async manager => {
            await this.deptUtilsService.lockTree(manager)
            const parentKeyId = input.parentKeyId ?? null
            await this.deptUtilsService.findReferencesRequired(manager, parentKeyId, input.leaderUserUid)
            await this.deptUtilsService.findCodeAvailable(manager, input.code)
            const dept = manager.create(Schema.TbAccountOrganization, {
                ...input,
                parentKeyId: parentKeyId as unknown as number
            })
            const saved = await manager.save(dept)
            await this.deptUtilsService.rebuildClosure(manager)
            return saved
        })
    }

    /**编辑组织*/
    public async httpBaseAccountUpdateDept(input: DeptDto.UpdateDeptPayloadDto): Promise<Schema.TbAccountOrganization> {
        const { keyId, ...fields } = input
        return this.deptRepository.manager.transaction(async manager => {
            await this.deptUtilsService.lockTree(manager)
            const dept = await this.deptUtilsService.findRequired(keyId, manager)

            // parentKeyId 是三态字段：undefined 保持原父级，null 显式移动到顶层，数字表示移动到指定父级。
            const nextParentKeyId = fields.parentKeyId === undefined ? dept.parentKeyId : (fields.parentKeyId ?? null)
            if (nextParentKeyId === keyId) {
                throw new BadRequestException('组织不能成为自己的父节点')
            }
            await this.deptUtilsService.findReferencesRequired(manager, nextParentKeyId, fields.leaderUserUid)
            if (isNotEmpty(fields.code) && fields.code !== dept.code) {
                await this.deptUtilsService.findCodeAvailable(manager, fields.code, keyId)
            }

            manager.merge(Schema.TbAccountOrganization, dept, fields, { parentKeyId: nextParentKeyId as unknown as number })
            await manager.save(dept)
            await this.deptUtilsService.rebuildClosure(manager)
            return dept
        })
    }

    /**删除组织*/
    public async httpBaseAccountDeleteDept(input: DeptDto.DeptKeyDto): Promise<SuccessResponseDataDto> {
        await this.deptRepository.manager.transaction(async manager => {
            await this.deptUtilsService.lockTree(manager)
            await this.deptUtilsService.findRequired(input.keyId, manager)
            await this.deptUtilsService.findDeleteAvailable(manager, input.keyId)
            await this.deptUtilsService.removeDepartmentRoles(manager, input.keyId)
            await this.deptUtilsService.removeOrganization(manager, input.keyId)
            await this.deptUtilsService.rebuildClosure(manager)
        })
        return { success: true }
    }
}
