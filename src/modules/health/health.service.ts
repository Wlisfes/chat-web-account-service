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
        // 账号服务的业务 Feign 入口只需要校验共享服务凭据；用户 Token 由 Gateway 交给 Auth 校验。
        const serviceToken = this.configService.get<string>('feign.service_token')
        const authConfigured = isNotEmpty(serviceToken)
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
