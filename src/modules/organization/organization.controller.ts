import { Body, Get, Post, Query } from '@nestjs/common'
import { ApiServiceDecorator, ApifoxController, SuccessResponseDataDto } from '@wlisfes/chat-web-base-schema/decorator'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { TbAccountOrganizationDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { OrganizationService } from '@/modules/organization/organization.service'
import * as OrganizationDto from '@/modules/organization/dto/organization.dto'

@ApifoxController('组织架构', '/dept', { bearerAuth: true })
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}

    @RequirePermissions('chat:deploy:system:organization')
    @ApiServiceDecorator(Get('tree/structure'), {
        operation: { summary: '获取完整组织树' },
        response: { type: OrganizationDto.OrganizationTreeNodeResponseDto, isArray: true, description: '完整组织树' }
    })
    public async httpBaseAccountOrganizationTreeStructure() {
        return this.organizationService.httpBaseAccountOrganizationTreeStructure()
    }

    @RequirePermissions('chat:deploy:system:organization')
    @ApiServiceDecorator(Get('tree/user'), {
        operation: { summary: '获取带启用成员的完整组织树' },
        response: { type: OrganizationDto.OrganizationUserNodeResponseDto, isArray: true, description: '带启用成员的完整组织树' }
    })
    public async httpBaseAccountOrganizationTreeUser() {
        return this.organizationService.httpBaseAccountOrganizationTreeUser()
    }

    @RequirePermissions('chat:deploy:system:organization')
    @ApiServiceDecorator(Get('resolve'), {
        operation: { summary: '获取组织详情' },
        request: { source: 'query', type: OrganizationDto.OrganizationKeyDto },
        response: { type: TbAccountOrganizationDto, description: '组织详情' }
    })
    public async httpBaseAccountOrganizationResolver(@Query() query: OrganizationDto.OrganizationKeyDto) {
        return this.organizationService.httpBaseAccountOrganizationResolver(query)
    }

    @RequirePermissions('chat:deploy:system:organization:create')
    @ApiServiceDecorator(Post('create'), {
        operation: { summary: '创建组织节点' },
        request: { source: 'body', type: OrganizationDto.CreateOrganizationDto },
        response: { type: TbAccountOrganizationDto, description: '新增后的组织节点' }
    })
    public async httpBaseAccountCreateOrganization(@Body() input: OrganizationDto.CreateOrganizationDto) {
        return this.organizationService.httpBaseAccountCreateOrganization(input)
    }

    @RequirePermissions('chat:deploy:system:organization:update')
    @ApiServiceDecorator(Post('update'), {
        operation: { summary: '更新或移动组织节点' },
        request: { source: 'body', type: OrganizationDto.UpdateOrganizationPayloadDto },
        response: { type: TbAccountOrganizationDto, description: '更新后的组织节点' }
    })
    public async httpBaseAccountUpdateOrganization(@Body() input: OrganizationDto.UpdateOrganizationPayloadDto) {
        return this.organizationService.httpBaseAccountUpdateOrganization(input)
    }

    @RequirePermissions('chat:deploy:system:organization:delete')
    @ApiServiceDecorator(Post('delete'), {
        operation: { summary: '删除没有下级、成员和权限引用的组织节点' },
        request: { source: 'body', type: OrganizationDto.OrganizationKeyDto },
        response: { type: SuccessResponseDataDto, description: '组织删除结果' }
    })
    public async httpBaseAccountDeleteOrganization(@Body() input: OrganizationDto.OrganizationKeyDto) {
        return this.organizationService.httpBaseAccountDeleteOrganization(input)
    }
}
