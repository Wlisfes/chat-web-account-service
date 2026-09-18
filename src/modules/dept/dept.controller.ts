import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { DeptService } from '@/modules/dept/dept.service'
import * as DeptDto from '@/modules/dept/dto/dept.dto'

@ApifoxController('组织架构', 'dept', { bearerAuth: true })
export class DeptController {
    constructor(private readonly deptService: DeptService) {}

    @RequirePermissions('chat:deploy:system:organization')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整组织树' },
        response: { type: DeptDto.DeptTreeNodeResponseDto, isArray: true, description: '完整组织树' }
    })
    public async httpBaseAccountDeptTree() {
        return this.deptService.httpBaseAccountDeptTree()
    }

    @RequirePermissions('chat:deploy:system:organization')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取组织详情' },
        request: { source: 'query', type: DeptDto.DeptKeyDto },
        response: { type: TbAccountOrganizationDto, description: '组织详情' }
    })
    public async httpBaseAccountDeptResolver(@Query() query: DeptDto.DeptKeyDto) {
        return this.deptService.httpBaseAccountDeptResolver(query)
    }

    @RequirePermissions('chat:deploy:system:organization:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建组织节点' },
        request: { source: 'body', type: DeptDto.CreateDeptDto },
        response: { type: TbAccountOrganizationDto, description: '新增后的组织节点' }
    })
    public async httpBaseAccountCreateDept(@Body() input: DeptDto.CreateDeptDto) {
        return this.deptService.httpBaseAccountCreateDept(input)
    }

    @RequirePermissions('chat:deploy:system:organization:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动组织节点' },
        request: { source: 'body', type: DeptDto.UpdateDeptPayloadDto },
        response: { type: TbAccountOrganizationDto, description: '更新后的组织节点' }
    })
    public async httpBaseAccountUpdateDept(@Body() input: DeptDto.UpdateDeptPayloadDto) {
        return this.deptService.httpBaseAccountUpdateDept(input)
    }

    @RequirePermissions('chat:deploy:system:organization:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级、成员和权限引用的组织节点' },
        request: { source: 'body', type: DeptDto.DeptKeyDto },
        response: { type: SuccessResponseDataDto, description: '组织删除结果' }
    })
    public async httpBaseAccountDeleteDept(@Body() input: DeptDto.DeptKeyDto) {
        return this.deptService.httpBaseAccountDeleteDept(input)
    }
}
