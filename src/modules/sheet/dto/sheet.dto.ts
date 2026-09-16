import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { EnumsResponseDto, ListResponseDto, PageListResponseDto } from '@wlisfes/chat-web-base-schema/decorator'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'
import * as Schema from '@wlisfes/chat-web-base-schema'

/**右侧菜单表格的分页筛选条件。*/
export class SheetColumnQueryDto extends IntersectionType(
    PageDto,
    PartialType(PickType(Schema.TbAccountMenuDto, ['parentKeyId', 'name', 'permissionCode', 'path'] as const))
) {}

export class CreateSheetDto extends IntersectionType(
    PickType(Schema.TbAccountMenuDto, ['parentKeyId', 'type', 'name', 'routeName', 'path', 'component']),
    PickType(Schema.TbAccountMenuDto, ['permissionCode', 'icon', 'externalUrl', 'sort', 'visible', 'keepAlive', 'status'])
) {}

export class SheetTreeNodeDto extends Schema.TbAccountMenuDto {
    @ApiProperty({ description: '下级菜单节点', type: () => SheetTreeNodeDto, isArray: true, example: [] })
    children: SheetTreeNodeDto[]
}

export class UpdateSheetDto extends PartialType(CreateSheetDto) {}

export class SheetKeyDto extends PickType(Schema.TbAccountMenuDto, ['keyId'] as const) {}

export class UpdateSheetPayloadDto extends IntersectionType(SheetKeyDto, UpdateSheetDto) {}

export class SheetTreeNodeResponseDto extends ListResponseDto(SheetTreeNodeDto, '完整菜单树节点列表') {}

export class SheetPageResponseDto extends PageListResponseDto(
    Schema.TbAccountMenuDto,
    '菜单平铺分页数据；parentKeyId 为空返回一级节点，否则将指定节点排在第一条并返回其直接下级节点'
) {}

export class SheetEnumsResponseDto extends EnumsResponseDto({
    typeOptions: { description: '菜单类型选项', example: Schema.TbAccountMenuTypeDefinition.options },
    statusOptions: { description: '菜单状态选项', example: Schema.TbAccountMenuStatusDefinition.options },
    visibleOptions: { description: '菜单显示状态选项', example: Schema.TbAccountMenuVisibleDefinition.options }
}) {}
