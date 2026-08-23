import mysql, { Connection, RowDataPacket } from 'mysql2/promise'
import { loadDatabaseConfig } from '@/cli/migrate-legacy-platform'

export const LEGACY_CONSUMER_SOURCE_TABLE = 'tb_windows_client'
export const ACCOUNT_CONSUMER_TARGET_TABLE = 'tb_account_consumer'

function identifier(value: string, label: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`${label}格式错误`)
    return value
}

async function tableExists(connection: Connection, database: string, table: string): Promise<boolean> {
    const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [database, table]
    )
    return Number(rows[0].count) === 1
}

async function rowCount(connection: Connection, database: string, table: string): Promise<number> {
    const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(`SELECT COUNT(*) count FROM \`${database}\`.\`${table}\``)
    return Number(rows[0].count)
}

export function buildLegacyConsumerInsertSql(sourceDatabase: string, targetDatabase: string): string {
    return `INSERT INTO \`${targetDatabase}\`.\`${ACCOUNT_CONSUMER_TARGET_TABLE}\`
        (\`key_id\`,\`uid\`,\`owner_user_uid\`,\`name\`,\`alias\`,\`brand_key_id\`,\`currency\`,\`email\`,\`phone\`,\`status\`,\`pay_mode\`,\`class_type\`,\`balance\`,\`balance_usd\`,\`credit\`,\`credit_usd\`,\`level\`,\`stage\`,\`auth_status\`,\`source\`,\`remark\`,\`create_time\`,\`modify_time\`)
        SELECT \`key_id\`,CAST(\`key_id\` AS CHAR),\`userId\`,\`name\`,\`alias\`,\`brand_id\`,\`currency\`,\`email\`,\`phone\`,\`status\`,\`pay_mode\`,\`class_type\`,\`balance\`,\`balance_usd\`,\`credit\`,\`credit_usd\`,\`level\`,\`stage\`,\`auth_status\`,\`source\`,\`remark\`,\`create_time\`,\`modify_time\`
        FROM \`${sourceDatabase}\`.\`${LEGACY_CONSUMER_SOURCE_TABLE}\``
}

export async function migrateLegacyConsumer(
    connection: Connection,
    sourceDatabase: string,
    targetDatabase: string,
    apply: boolean
): Promise<number> {
    if (!(await tableExists(connection, sourceDatabase, LEGACY_CONSUMER_SOURCE_TABLE))) {
        throw new Error(`旧客户表不存在：${sourceDatabase}.${LEGACY_CONSUMER_SOURCE_TABLE}`)
    }
    if (!(await tableExists(connection, targetDatabase, ACCOUNT_CONSUMER_TARGET_TABLE))) {
        throw new Error(`目标客户表不存在：${targetDatabase}.${ACCOUNT_CONSUMER_TARGET_TABLE}`)
    }
    if ((await rowCount(connection, targetDatabase, ACCOUNT_CONSUMER_TARGET_TABLE)) > 0) {
        throw new Error(`目标客户表非空：${ACCOUNT_CONSUMER_TARGET_TABLE}`)
    }

    const sourceCount = await rowCount(connection, sourceDatabase, LEGACY_CONSUMER_SOURCE_TABLE)
    await connection.beginTransaction()
    try {
        await connection.query(buildLegacyConsumerInsertSql(sourceDatabase, targetDatabase))
        if (apply) await connection.commit()
        else await connection.rollback()
        return sourceCount
    } catch (error) {
        await connection.rollback()
        throw error
    }
}

async function main(): Promise<void> {
    const apply = process.argv.slice(2).includes('--apply')
    const sourceDatabase = identifier(process.env.LEGACY_FINANCE_DATABASE?.trim() || 'legacy_windows', '旧财务数据库名称')
    const config = await loadDatabaseConfig()
    const targetDatabase = identifier(
        process.env.ACCOUNT_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim() || '',
        '目标数据库名称'
    )
    if (sourceDatabase === targetDatabase) throw new Error('旧财务库和账号库不能相同')

    const connection = await mysql.createConnection({
        host: process.env.ACCOUNT_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.ACCOUNT_MYSQL_PORT || config.port || 3306),
        user: process.env.ACCOUNT_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.ACCOUNT_MYSQL_PASSWORD ?? config.password,
        database: targetDatabase,
        charset: process.env.ACCOUNT_MYSQL_CHARSET || config.charset || 'utf8mb4',
        timezone: process.env.ACCOUNT_MYSQL_TIMEZONE || config.timezone || '+08:00',
        supportBigNumbers: true,
        bigNumberStrings: true
    })
    try {
        const count = await migrateLegacyConsumer(connection, sourceDatabase, targetDatabase, apply)
        process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sourceDatabase, targetDatabase, count }, null, 2)}\n`)
    } finally {
        await connection.end()
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
