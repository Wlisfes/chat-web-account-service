import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { isNotEmpty } from 'class-validator'
import { DataSource } from 'typeorm'
import { ServiceDependencyResponseDto, ServiceLivenessResponseDto, ServiceReadinessResponseDto } from '@/dto/api-response.dto'

type TableRow = {
    tableName: string
}

@Injectable()
export class HealthService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly configService: ConfigService
    ) {}

    public async getLiveness(): Promise<ServiceLivenessResponseDto> {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    public async getReadiness(): Promise<ServiceReadinessResponseDto> {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        // 令牌校验依赖鉴权服务的内部协议，账号服务只需确认调用地址与服务凭据已配置。
        const authServiceUrl = this.configService.get<string>('feign.chat-web-auth.url')
        const serviceToken = this.configService.get<string>('feign.service_token')
        const authConfigured = isNotEmpty(authServiceUrl) && isNotEmpty(serviceToken)
        let database: ServiceDependencyResponseDto
        let databaseReady = false
        try {
            const placeholders = requiredTables.map(() => '?').join(', ')
            const rows = (await this.dataSource.query(
                `SELECT table_name AS tableName
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                   AND table_name IN (${placeholders})`,
                requiredTables
            )) as TableRow[]
            const existingTables = new Set(rows.map(row => row.tableName))
            const missingTables = requiredTables.filter(tableName => !existingTables.has(tableName))
            databaseReady = this.dataSource.isInitialized && !missingTables.length
            database = {
                connected: this.dataSource.isInitialized,
                requiredTableCount: requiredTables.length,
                missingTables
            }
        } catch (error) {
            database = {
                connected: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }

        return {
            status: databaseReady && authConfigured ? 'UP' : 'DOWN',
            database,
            security: { authConfigured },
            timestamp: new Date().toISOString()
        }
    }
}
