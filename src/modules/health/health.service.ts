import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

type TableRow = {
    tableName: string
}

@Injectable()
export class HealthService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    getLiveness() {
        return { status: 'UP', timestamp: new Date().toISOString() }
    }

    async getReadiness() {
        const requiredTables = [...new Set(this.dataSource.entityMetadatas.map(metadata => metadata.tableName))].sort()
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
                status: missingTables.length ? 'DOWN' : 'UP',
                database: {
                    connected: this.dataSource.isInitialized,
                    requiredTableCount: requiredTables.length,
                    missingTables
                },
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            return {
                status: 'DOWN',
                database: {
                    connected: false,
                    error: error instanceof Error ? error.message : String(error)
                },
                timestamp: new Date().toISOString()
            }
        }
    }
}
