import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { ListResponseDto, PageListResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { Type } from 'class-transformer'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

/**右侧菜单表格的分页筛选条件。*/
export class SheetColumnQueryDto extends PageDto {
    @ApiPropertyOptional({
        description: '父菜单主键；未传或传 null 时查询一级节点，传入主键时返回该节点及其直接下级节点',
        example: 1,
        nullable: true
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '父菜单主键必须是整数' })
    @Min(1, { message: '父菜单主键必须大于0' })
    parentKeyId?: number | null

    @ApiPropertyOptional({ description: '按菜单名称模糊查询', example: '用户管理' })
    @IsOptional()
    @IsString({ message: '菜单名称必须是字符串' })
    @MaxLength(64, { message: '菜单名称长度不能超过64位' })
    name?: string

    @ApiPropertyOptional({ description: '按权限码模糊查询', example: 'account:user' })
    @IsOptional()
    @IsString({ message: '权限码必须是字符串' })
    @MaxLength(128, { message: '权限码长度不能超过128位' })
    permissionCode?: string

    @ApiPropertyOptional({ description: '按路由路径模糊查询', example: '/system/user' })
    @IsOptional()
    @IsString({ message: '路由路径必须是字符串' })
    @MaxLength(255, { message: '路由路径长度不能超过255位' })
    path?: string
}

export class CreateSheetDto extends IntersectionType(
    PickType(TbAccountMenuDto, ['parentKeyId', 'type', 'name', 'routeName', 'path', 'component']),
    PickType(TbAccountMenuDto, ['permissionCode', 'icon', 'externalUrl', 'sort', 'visible', 'keepAlive', 'status'])
) {}

export class SheetTreeNodeDto extends TbAccountMenuDto {
    @ApiProperty({ description: '下级菜单节点', type: () => SheetTreeNodeDto, isArray: true, example: [] })
    children: SheetTreeNodeDto[]
}

export class UpdateSheetDto extends PartialType(CreateSheetDto) {}

export class SheetKeyDto extends PickType(TbAccountMenuDto, ['keyId']) {}

export class UpdateSheetPayloadDto extends IntersectionType(SheetKeyDto, UpdateSheetDto) {}

export class SheetTreeNodeResponseDto extends ListResponseDto(SheetTreeNodeDto, '完整菜单树节点列表') {}

export class SheetPageResponseDto extends PageListResponseDto(
    TbAccountMenuDto,
    '菜单平铺分页数据；parentKeyId 为空返回一级节点，否则将指定节点排在第一条并返回其直接下级节点'
) {}
