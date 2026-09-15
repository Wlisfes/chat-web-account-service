import { ApiProperty } from '@nestjs/swagger'
import { SheetTreeNodeDto } from '@/modules/sheet/dto/sheet.dto'

export class EffectiveAccessResponseDto {
    @ApiProperty({ description: '是否为超级管理员', example: false })
    superAdmin: boolean

    @ApiProperty({ description: '有效角色编码', type: [String], example: ['sales_manager'] })
    roleCodes: string[]

    @ApiProperty({ description: '有效权限编码', type: [String], example: ['account:user:list'] })
    permissionCodes: string[]

    @ApiProperty({ description: '当前账号可访问的菜单树', type: [SheetTreeNodeDto] })
    menuTree: SheetTreeNodeDto[]
}

export class EffectiveDataScopeResponseDto {
    @ApiProperty({ description: '是否拥有全部数据权限', example: false })
    all: boolean

    @ApiProperty({ description: '是否包含本人数据', example: true })
    includeSelf: boolean

    @ApiProperty({ description: '可访问的组织主键', type: [Number], example: [1, 2, 3] })
    organizationKeyIds: number[]
}
