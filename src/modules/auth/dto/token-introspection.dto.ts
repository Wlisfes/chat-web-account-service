import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/** 网关或内部服务提交给账号服务的访问令牌内省请求。 */
export class TokenIntrospectionDto {
    @ApiProperty({ description: '待校验的用户访问令牌，不包含 Bearer 前缀', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString({ message: '访问令牌必须是字符串' })
    @IsNotEmpty({ message: '访问令牌必填' })
    @MaxLength(4096, { message: '访问令牌长度不能超过4096位' })
    token: string
}
