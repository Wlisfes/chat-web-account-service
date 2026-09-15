import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { TbAccountMenuDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { ListResponseDto, PageListResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'

/**右侧菜单表格的分页筛选条件。*/
export class SheetColumnQueryDto extends IntersectionType(
    PageDto,
    PartialType(PickType(TbAccountMenuDto, ['parentKeyId', 'name', 'permissionCode', 'path'] as const))
) {}

export class CreateSheetDto extends IntersectionType(
    PickType(TbAccountMenuDto, ['parentKeyId', 'type', 'name', 'routeName', 'path', 'component']),
    PickType(TbAccountMenuDto, ['permissionCode', 'icon', 'externalUrl', 'sort', 'visible', 'keepAlive', 'status'])
) {}

export class SheetTreeNodeDto extends TbAccountMenuDto {
    @ApiProperty({ description: '下级菜单节点', type: () => SheetTreeNodeDto, isArray: true, example: [] })
    children: SheetTreeNodeDto[]
}

export class UpdateSheetDto extends PartialType(CreateSheetDto) {}

export class SheetKeyDto extends PickType(TbAccountMenuDto, ['keyId'] as const) {}

export class UpdateSheetPayloadDto extends IntersectionType(SheetKeyDto, UpdateSheetDto) {}

export class SheetTreeNodeResponseDto extends ListResponseDto(SheetTreeNodeDto, '完整菜单树节点列表') {}

export class SheetPageResponseDto extends PageListResponseDto(
    TbAccountMenuDto,
    '菜单平铺分页数据；parentKeyId 为空返回一级节点，否则将指定节点排在第一条并返回其直接下级节点'
) {}
