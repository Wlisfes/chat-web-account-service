import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class PageDto {
    @ApiPropertyOptional({ description: '页码，从1开始', default: 1, minimum: 1 })
    @Type(() => Number)
    @IsOptional()
    @IsInt({ message: '页码必须是整数' })
    @Min(1, { message: '页码不能小于1' })
    page: number = 1

    @ApiPropertyOptional({ description: '每页数量', default: 20, minimum: 1, maximum: 100 })
    @Type(() => Number)
    @IsOptional()
    @IsInt({ message: '每页数量必须是整数' })
    @Min(1, { message: '每页数量不能小于1' })
    @Max(100, { message: '每页数量不能超过100' })
    pageSize: number = 20
}

export interface PageResult<TItem> {
    items: TItem[]
    total: number
    page: number
    pageSize: number
}
