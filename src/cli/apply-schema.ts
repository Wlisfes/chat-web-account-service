import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import mysql, { RowDataPacket } from 'mysql2/promise'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import { getDatabaseName, loadLocalEnvironment, loadTaskDatabaseConfig } from '@/cli/database-config'

type MigrationRow = RowDataPacket & { checksum: string }
type LockRow = RowDataPacket & { acquired?: number | string | null }
const MIGRATION_TABLE = 'tb_task_schema_migration'
export const SCHEMA_MIGRATION_LOCK_NAME = 'chat-web-task:schema-migration'

/** 找到公共包中随版本发布的 Task 增量 SQL。 */
function changesDirectory(): string {
    const schemaEntry = createRequire(__filename).resolve('@wlisfes/chat-web-base-schema/chat-web-task-mysql')
    return path.join(path.resolve(path.dirname(schemaEntry), '../../../..'), 'src/schema/chat-web-task-mysql/sql/changes')
}

/** 获取跨进程 Schema 迁移锁，避免多个发布任务同时执行 DDL 和写入迁移台账。 */
export async function acquireSchemaMigrationLock(connection: mysql.Connection): Promise<void> {
    const [rows] = await connection.query<LockRow[]>('SELECT GET_LOCK(?, 30) AS acquired', [SCHEMA_MIGRATION_LOCK_NAME])
    if (Number(rows[0]?.acquired) !== 1) throw new Error('获取 Task Schema 迁移锁超时，请稍后重试')
}

/** 释放跨进程 Schema 迁移锁。 */
export async function releaseSchemaMigrationLock(connection: mysql.Connection): Promise<void> {
    await connection.query('SELECT RELEASE_LOCK(?)', [SCHEMA_MIGRATION_LOCK_NAME])
}

/** 按文件名顺序幂等执行 Task 数据库增量 SQL；已执行文件的校验和变化时中止。 */
export async function applySchema(): Promise<void> {
    loadLocalEnvironment()
    const config = await loadTaskDatabaseConfig()
    const database = getDatabaseName(config)
    const connection = await mysql.createConnection({
        host: process.env.TASK_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.TASK_MYSQL_PORT || config.port || 3306),
        user: process.env.TASK_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.TASK_MYSQL_PASSWORD ?? config.password,
        database,
        charset: process.env.TASK_MYSQL_CHARSET || config.charset || 'utf8mb4',
        multipleStatements: true
    })

    let migrationLockAcquired = false
    try {
        await acquireSchemaMigrationLock(connection)
        migrationLockAcquired = true
        const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
        assertMysqlDatabaseIsolation(
            grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string')),
            database
        )
        await connection.query(
            `CREATE TABLE IF NOT EXISTS \`${MIGRATION_TABLE}\` (
                \`filename\` varchar(255) NOT NULL,
                \`checksum\` char(64) NOT NULL,
                \`applied_time\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (\`filename\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Task Schema增量记录表'`
        )
        const directory = changesDirectory()
        const filenames = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
        for (const filename of filenames) {
            const sql = await readFile(path.join(directory, filename), 'utf8')
            const checksum = createHash('sha256').update(sql).digest('hex')
            const [rows] = await connection.execute<MigrationRow[]>(`SELECT checksum FROM \`${MIGRATION_TABLE}\` WHERE filename = ?`, [
                filename
            ])
            if (rows.length) {
                if (rows[0].checksum !== checksum) throw new Error(`已应用增量 SQL 校验和变化：${filename}`)
                process.stdout.write(`Schema migration skipped: ${filename}\n`)
                continue
            }
            await connection.query(sql)
            await connection.execute(`INSERT INTO \`${MIGRATION_TABLE}\` (filename, checksum) VALUES (?, ?)`, [filename, checksum])
            process.stdout.write(`Schema migration applied: ${filename}\n`)
        }
    } finally {
        if (migrationLockAcquired) {
            try {
                await releaseSchemaMigrationLock(connection)
            } catch (error) {
                process.stderr.write(`释放 Task Schema 迁移锁失败：${error instanceof Error ? error.message : String(error)}\n`)
            }
        }
        await connection.end()
    }
}

if (require.main === module) {
    applySchema().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
