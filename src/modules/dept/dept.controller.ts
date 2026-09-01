import { Body, Get, Post, Query } from '@nestjs/common'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { CreateDeptDto, DeptKeyDto, UpdateDeptPayloadDto } from '@/modules/dept/dto/dept.dto'
import { DeptService } from '@/modules/dept/dept.service'
import { DeptTreeNodeResponseDto } from '@/dto/api-response.dto'

@ApifoxController('组织架构', 'dept', { bearerAuth: true })
export class DeptController {
    constructor(private readonly deptService: DeptService) {}

    @RequirePermissions('account:organization:list')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整组织树' },
        response: { type: DeptTreeNodeResponseDto, isArray: true, description: '完整组织树' }
    })
    public async httpBaseAccountDeptTree() {
        return this.deptService.httpBaseAccountDeptTree()
    }

    @RequirePermissions('account:organization:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取组织详情' },
        request: { source: 'query', type: DeptKeyDto },
        response: { type: TbAccountOrganizationDto, description: '组织详情' }
    })
    public async httpBaseAccountDeptResolver(@Query() query: DeptKeyDto) {
        return this.deptService.httpBaseAccountDeptResolver(query)
    }

    @RequirePermissions('account:organization:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建组织节点' },
        request: { source: 'body', type: CreateDeptDto },
        response: { type: TbAccountOrganizationDto, description: '新增后的组织节点' }
    })
    public async httpBaseAccountCreateDept(@Body() input: CreateDeptDto) {
        return this.deptService.httpBaseAccountCreateDept(input)
    }

    @RequirePermissions('account:organization:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动组织节点' },
        request: { source: 'body', type: UpdateDeptPayloadDto },
        response: { type: TbAccountOrganizationDto, description: '更新后的组织节点' }
    })
    public async httpBaseAccountUpdateDept(@Body() input: UpdateDeptPayloadDto) {
        return this.deptService.httpBaseAccountUpdateDept(input)
    }

    @RequirePermissions('account:organization:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级、成员和权限引用的组织节点' },
        request: { source: 'body', type: DeptKeyDto },
        response: { type: SuccessResponseDataDto, description: '组织删除结果' }
    })
    public async httpBaseAccountDeleteDept(@Body() input: DeptKeyDto) {
        return this.deptService.httpBaseAccountDeleteDept(input)
    }
}
