import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermissions } from '@/modules/auth/auth.decorator'
import { CreateOrganizationDto, UpdateOrganizationDto } from '@/modules/organizations/dto/organization.dto'
import { OrganizationsService } from '@/modules/organizations/organizations.service'

@ApiTags('组织架构')
@ApiBearerAuth('authorization')
@Controller('organizations')
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService) {}

    @Get('tree')
    @RequirePermissions('account:organization:list')
    @ApiOperation({ summary: '获取完整组织树' })
    getTree() {
        return this.organizationsService.getTree()
    }

    @Get(':keyId')
    @RequirePermissions('account:organization:list')
    @ApiOperation({ summary: '获取组织详情' })
    findOne(@Param('keyId', ParseIntPipe) keyId: number) {
        return this.organizationsService.findOne(keyId)
    }

    @Post()
    @RequirePermissions('account:organization:create')
    @ApiOperation({ summary: '创建组织节点' })
    create(@Body() input: CreateOrganizationDto) {
        return this.organizationsService.create(input)
    }

    @Patch(':keyId')
    @RequirePermissions('account:organization:update')
    @ApiOperation({ summary: '更新或移动组织节点' })
    update(@Param('keyId', ParseIntPipe) keyId: number, @Body() input: UpdateOrganizationDto) {
        return this.organizationsService.update(keyId, input)
    }

    @Delete(':keyId')
    @RequirePermissions('account:organization:delete')
    @ApiOperation({ summary: '删除没有下级、成员和权限引用的组织节点' })
    async remove(@Param('keyId', ParseIntPipe) keyId: number) {
        await this.organizationsService.remove(keyId)
        return { success: true }
    }
}
