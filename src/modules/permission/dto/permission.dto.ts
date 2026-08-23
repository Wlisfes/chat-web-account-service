import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class PermissionDataScopeQueryDto {
    @ApiProperty({ description: '业务资源编码', example: 'account:user' })
    @IsString({ message: '业务资源编码必须是字符串' })
    @IsNotEmpty({ message: '业务资源编码必填' })
    @MaxLength(128, { message: '业务资源编码长度不能超过128位' })
    resourceCode: string
}
