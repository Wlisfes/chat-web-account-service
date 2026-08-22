import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermissions } from '@wlisfes/chat-web-base-schema/auth'
import { CreateOrganizationDto, OrganizationKeyDto, UpdateOrganizationPayloadDto } from '@/modules/organization/dto/organization.dto'
import { OrganizationService } from '@/modules/organization/organization.service'

@ApiTags('组织架构')
@ApiBearerAuth('authorization')
@Controller('organization')
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}

    @Get('tree/structure')
    @RequirePermissions('account:organization:list')
    @ApiOperation({ summary: '获取完整组织树' })
    httpBaseAccountOrganizationTree() {
        return this.organizationService.getTree()
    }

    @Get('resolver')
    @RequirePermissions('account:organization:list')
    @ApiOperation({ summary: '获取组织详情' })
    httpBaseAccountOrganizationResolver(@Query() query: OrganizationKeyDto) {
        return this.organizationService.findOne(query.keyId)
    }

    @Post('create')
    @RequirePermissions('account:organization:create')
    @ApiOperation({ summary: '创建组织节点' })
    httpBaseAccountCreateOrganization(@Body() input: CreateOrganizationDto) {
        return this.organizationService.create(input)
    }

    @Post('update')
    @RequirePermissions('account:organization:update')
    @ApiOperation({ summary: '更新或移动组织节点' })
    httpBaseAccountUpdateOrganization(@Body() input: UpdateOrganizationPayloadDto) {
        const { keyId, ...payload } = input
        return this.organizationService.update(keyId, payload)
    }

    @Post('delete')
    @RequirePermissions('account:organization:delete')
    @ApiOperation({ summary: '删除没有下级、成员和权限引用的组织节点' })
    async httpBaseAccountDeleteOrganization(@Body() input: OrganizationKeyDto) {
        await this.organizationService.remove(input.keyId)
        return { success: true }
    }
}
