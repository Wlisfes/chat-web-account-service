import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import {
    TbAccountConsumerAuthStatus,
    TbAccountConsumerDto,
    TbAccountConsumerPayMode,
    TbAccountConsumerSource,
    TbAccountConsumerStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import { SizePageDto } from '@wlisfes/chat-web-base-schema/utils'

export class CreateConsumerDto {
    @ApiProperty({ description: '客户名称', example: '测试客户' })
    @IsString({ message: '客户名称必须是字符串' })
    @IsNotEmpty({ message: '客户名称必填' })
    @MaxLength(64, { message: '客户名称长度不能超过64位' })
    name: string

    @ApiProperty({ description: '客户别名', required: false, example: '测试客户别名' })
    @IsOptional()
    @IsString({ message: '客户别名必须是字符串' })
    @MaxLength(64, { message: '客户别名长度不能超过64位' })
    alias?: string

    @ApiProperty({ description: '财务品牌主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '财务品牌主键必须是整数' })
    @Min(1, { message: '财务品牌主键必须大于0' })
    brandId: number

    @ApiProperty({ description: '财务币种编码', example: 'USD' })
    @IsString({ message: '财务币种编码必须是字符串' })
    @MaxLength(16, { message: '财务币种编码长度不能超过16位' })
    currency: string

    @ApiProperty({ description: '邮箱', example: 'consumer@example.com' })
    @IsEmail({}, { message: '邮箱格式错误' })
    @MaxLength(128, { message: '邮箱长度不能超过128位' })
    email: string

    @ApiProperty({ description: '电话号码', required: false, example: '+8613800138000' })
    @IsOptional()
    @IsString({ message: '电话号码必须是字符串' })
    @MaxLength(32, { message: '电话号码长度不能超过32位' })
    phone?: string

    @ApiProperty({ description: '客户状态', enum: TbAccountConsumerStatus, required: false, example: TbAccountConsumerStatus.ENABLE })
    @IsOptional()
    @IsEnum(TbAccountConsumerStatus, { message: '客户状态格式错误' })
    status?: TbAccountConsumerStatus

    @ApiProperty({ description: '付款模式', enum: TbAccountConsumerPayMode, example: TbAccountConsumerPayMode.PREPAID })
    @IsEnum(TbAccountConsumerPayMode, { message: '付款模式格式错误' })
    payMode: TbAccountConsumerPayMode

    @ApiProperty({
        description: '认证状态',
        enum: TbAccountConsumerAuthStatus,
        required: false,
        example: TbAccountConsumerAuthStatus.UNVERIFIED
    })
    @IsOptional()
    @IsEnum(TbAccountConsumerAuthStatus, { message: '认证状态格式错误' })
    authStatus?: TbAccountConsumerAuthStatus

    @ApiProperty({ description: '注册来源', enum: TbAccountConsumerSource, required: false, example: TbAccountConsumerSource.MANUAL })
    @IsOptional()
    @IsEnum(TbAccountConsumerSource, { message: '注册来源格式错误' })
    source?: TbAccountConsumerSource

    @ApiProperty({ description: '备注', required: false, example: '重点跟进客户' })
    @IsOptional()
    @IsString({ message: '备注必须是字符串' })
    @MaxLength(1024, { message: '备注长度不能超过1024位' })
    remark?: string
}

export class UpdateConsumerDto extends CreateConsumerDto {
    @ApiProperty({ description: '客户主键', example: 1 })
    @Type(() => Number)
    @IsInt({ message: '客户主键必须是整数' })
    @Min(1, { message: '客户主键必须大于0' })
    keyId: number
}

export class UpdateConsumerStatusDto extends PickType(TbAccountConsumerDto, ['status'] as const) {
    @ApiProperty({ description: '客户主键', example: 5181000 })
    @Type(() => Number)
    @IsInt({ message: '客户主键必须是整数' })
    @Min(1, { message: '客户主键必须大于0' })
    keyId: number
}

export class ResolveConsumerDto extends PickType(TbAccountConsumerDto, ['keyId'] as const) {
    @ApiProperty({ description: '客户主键', example: 5181000 })
    @Type(() => Number)
    @IsInt({ message: '客户主键必须是整数' })
    @Min(1, { message: '客户主键必须大于0' })
    keyId: number
}

export class SelectConsumerDto extends PartialType(PickType(TbAccountConsumerDto, ['name'] as const)) {}

export class ListConsumerDto extends IntersectionType(
    SizePageDto,
    PartialType(PickType(TbAccountConsumerDto, ['name', 'status', 'currency', 'payMode', 'authStatus', 'source'] as const))
) {
    @ApiProperty({ description: '财务品牌主键', required: false, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '财务品牌主键必须是整数' })
    @Min(1, { message: '财务品牌主键必须大于0' })
    brandId?: number
}
