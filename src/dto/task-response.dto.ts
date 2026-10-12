import { ApiProperty } from '@nestjs/swagger'

/**Task 服务存活检查响应。*/
export class TaskLivenessResponseDto {
    @ApiProperty({ description: '服务状态', enum: ['UP'], example: 'UP' })
    status: 'UP'
}
