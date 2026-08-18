import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator'

export class LoginDto {
    @ApiProperty({ description: '工号、手机号或邮箱', example: '1001' })
    @IsString({ message: '登录账号必须是字符串' })
    @IsNotEmpty({ message: '登录账号必填' })
    @MaxLength(128, { message: '登录账号长度不能超过128位' })
    account: string

    @ApiProperty({ description: '登录密码', example: 'Abc123456', writeOnly: true })
    @IsString({ message: '登录密码必须是字符串' })
    @IsNotEmpty({ message: '登录密码必填' })
    @MaxLength(128, { message: '登录密码长度不能超过128位' })
    password: string

    @ApiProperty({ description: '图形验证码', example: 'A7K9' })
    @IsString({ message: '验证码必须是字符串' })
    @IsNotEmpty({ message: '验证码必填' })
    @Length(4, 4, { message: '验证码必须为4位' })
    code: string
}
