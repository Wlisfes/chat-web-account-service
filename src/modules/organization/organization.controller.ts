import { Body, Get, Post, Query } from '@nestjs/common'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { CreateOrganizationDto, OrganizationKeyDto, UpdateOrganizationPayloadDto } from '@/modules/organization/dto/organization.dto'
import { OrganizationService } from '@/modules/organization/organization.service'
import { OrganizationTreeNodeResponseDto } from '@/dto/api-response.dto'

@ApifoxController('组织架构', 'organization', { bearerAuth: true })
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}

    @RequirePermissions('account:organization:list')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整组织树' },
        response: { type: OrganizationTreeNodeResponseDto, isArray: true, description: '完整组织树' }
    })
    public async httpBaseAccountOrganizationTree() {
        return this.organizationService.httpBaseAccountOrganizationTree()
    }

    @RequirePermissions('account:organization:list')
    @ApiServiceDecorator(Get('resolver'), {
        operation: { summary: '获取组织详情' },
        request: { source: 'query', type: OrganizationKeyDto },
        response: { type: TbAccountOrganizationDto, description: '组织详情' }
    })
    public async httpBaseAccountOrganizationResolver(@Query() query: OrganizationKeyDto) {
        return this.organizationService.httpBaseAccountOrganizationResolver(query)
    }

    @RequirePermissions('account:organization:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建组织节点' },
        request: { source: 'body', type: CreateOrganizationDto },
        response: { type: TbAccountOrganizationDto, description: '新增后的组织节点' }
    })
    public async httpBaseAccountCreateOrganization(@Body() input: CreateOrganizationDto) {
        return this.organizationService.httpBaseAccountCreateOrganization(input)
    }

    @RequirePermissions('account:organization:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动组织节点' },
        request: { source: 'body', type: UpdateOrganizationPayloadDto },
        response: { type: TbAccountOrganizationDto, description: '更新后的组织节点' }
    })
    public async httpBaseAccountUpdateOrganization(@Body() input: UpdateOrganizationPayloadDto) {
        return this.organizationService.httpBaseAccountUpdateOrganization(input)
    }

    @RequirePermissions('account:organization:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级、成员和权限引用的组织节点' },
        request: { source: 'body', type: OrganizationKeyDto },
        response: { type: SuccessResponseDataDto, description: '组织删除结果' }
    })
    public async httpBaseAccountDeleteOrganization(@Body() input: OrganizationKeyDto) {
        return this.organizationService.httpBaseAccountDeleteOrganization(input)
    }
}
