import { ApiProperty } from '@nestjs/swagger'

/** 账号服务存活检查响应：GET /health/live。 */
export class ServiceLivenessResponseDto {
    @ApiProperty({ description: '服务状态', enum: ['UP'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string
}

/** ServiceReadinessResponseDto.database 字段结构；响应：GET /health、GET /health/ready（账号服务健康检查；账号服务就绪检查）。 */
export class ServiceDependencyResponseDto {
    @ApiProperty({ description: '依赖是否连接成功', example: true })
    connected: boolean

    @ApiProperty({ description: '必需数据表数量', required: false, example: 11 })
    requiredTableCount?: number

    @ApiProperty({ description: '缺失的数据表', type: [String], required: false, example: [] })
    missingTables?: string[]

    @ApiProperty({ description: '检查失败原因', required: false, example: '连接超时' })
    error?: string
}

/** ServiceReadinessResponseDto.security 字段结构；响应：GET /health、GET /health/ready（账号服务健康检查；账号服务就绪检查）。 */
export class ServiceSecurityResponseDto {
    @ApiProperty({ description: '鉴权服务内部认证配置是否完整', example: true })
    authConfigured: boolean
}

/** 响应：GET /health、GET /health/ready（账号服务健康检查；账号服务就绪检查）。 */
export class ServiceReadinessResponseDto {
    @ApiProperty({ description: '服务就绪状态', enum: ['UP', 'DOWN'], example: 'UP' })
    status: string

    @ApiProperty({ description: '检查时间', example: '2026-08-23T04:00:00.000Z' })
    timestamp: string

    @ApiProperty({ description: '数据库状态', type: ServiceDependencyResponseDto })
    database: ServiceDependencyResponseDto

    @ApiProperty({ description: '安全配置状态', type: ServiceSecurityResponseDto })
    security: ServiceSecurityResponseDto
}
