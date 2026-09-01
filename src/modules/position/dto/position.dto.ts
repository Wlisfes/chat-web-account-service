import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { TbAccountPositionDto } from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { PageDto } from '@wlisfes/chat-web-base-schema/utils'

export class PositionKeyDto {
    @ApiProperty({ description: '职位主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '职位主键必须是整数' })
    @Min(1, { message: '职位主键必须大于0' })
    keyId: number
}

export class CreatePositionDto extends IntersectionType(
    PickType(TbAccountPositionDto, ['name'] as const),
    PartialType(PickType(TbAccountPositionDto, ['sort'] as const))
) {}

export class UpdatePositionDto extends IntersectionType(
    PositionKeyDto,
    PartialType(PickType(TbAccountPositionDto, ['name', 'sort'] as const))
) {}

export class ListPositionDto extends IntersectionType(PageDto, PartialType(PickType(TbAccountPositionDto, ['name'] as const))) {}

export class SelectPositionDto {
    @ApiPropertyOptional({ description: '职位名称关键字', example: '客户' })
    @IsOptional()
    @IsString({ message: '职位名称关键字必须是字符串' })
    @MaxLength(64, { message: '职位名称关键字长度不能超过64位' })
    name?: string
}
