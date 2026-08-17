import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

type TableRow = {
    tableName: string
}

@Injectable()
export class HealthService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly configService: ConfigService
    ) {}

    getLiveness() {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    async getReadiness() {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
        const jwtSecret = this.configService.get<string>('JWT_SECRET') || this.configService.get<string>('security.jwt.secret')
        const jwtConfigured = typeof jwtSecret === 'string' && jwtSecret.length >= 32
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
            return {
                status: missingTables.length || !jwtConfigured ? 'DOWN' : 'UP',
                database: {
                    connected: this.dataSource.isInitialized,
                    requiredTableCount: requiredTables.length,
                    missingTables
                },
                security: { jwtConfigured },
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            return {
                status: 'DOWN',
                database: {
                    connected: false,
                    error: error instanceof Error ? error.message : String(error)
                },
                security: { jwtConfigured },
                timestamp: new Date().toISOString()
            }
        }
    }
}
