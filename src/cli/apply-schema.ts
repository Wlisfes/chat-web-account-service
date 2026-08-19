import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import yaml from 'js-yaml'
import mysql, { RowDataPacket } from 'mysql2/promise'

type DatabaseConfig = {
    host: string
    port?: number | string
    username: string
    password: string
    database?: string
    name?: string
    charset?: string
}

type MigrationRow = RowDataPacket & {
    checksum: string
}

const MIGRATION_TABLE = 'tb_account_schema_migration'

function requiredEnvironment(key: string): string {
    const value = process.env[key]?.trim()
    if (!value) {
        throw new Error(`缺少环境变量：${key}`)
    }
    return value
}

async function loadDatabaseConfig(): Promise<DatabaseConfig> {
    const server = requiredEnvironment('NACOS_SERVER')
    const baseUrl = /^https?:\/\//i.test(server) ? server : `http://${server}`
    const params = new URLSearchParams({
        dataId: requiredEnvironment('NACOS_CONFIG_DATA_ID'),
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/nacos/v1/cs/configs?${params}`)
    if (!response.ok) {
        throw new Error(`读取 Nacos 配置失败：HTTP ${response.status}`)
    }
    const config = yaml.load(await response.text()) as Record<string, unknown>
    const databaseRoot = config?.database as Record<string, unknown> | undefined
    const database = databaseRoot?.['chat-web-account']
    if (!database || typeof database !== 'object' || Array.isArray(database)) {
        throw new Error('缺少 Nacos 数据库配置节点：database.chat-web-account')
    }
    return database as DatabaseConfig
}

function resolveChangesDirectory(): string {
    const requireFromHere = createRequire(__filename)
    const schemaEntry = requireFromHere.resolve('@wlisfes/chat-web-base-schema/chat-web-account-mysql')
    const packageRoot = path.resolve(path.dirname(schemaEntry), '../../../..')
    return path.join(packageRoot, 'src/schema/chat-web-account-mysql/sql/changes')
}

async function main(): Promise<void> {
    const config = await loadDatabaseConfig()
    const databaseName = process.env.ACCOUNT_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim()
    if (!databaseName) {
        throw new Error('数据库名称不能为空')
    }
    const connection = await mysql.createConnection({
        host: process.env.ACCOUNT_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.ACCOUNT_MYSQL_PORT || config.port || 3306),
        user: config.username,
        password: config.password,
        database: databaseName,
        charset: config.charset || 'utf8mb4',
        multipleStatements: true
    })

    try {
        const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
        assertMysqlDatabaseIsolation(
            grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string')),
            databaseName
        )
        await connection.query(
            `CREATE TABLE IF NOT EXISTS \`${MIGRATION_TABLE}\` (
                \`filename\` varchar(255) NOT NULL COMMENT '增量SQL文件名',
                \`checksum\` char(64) NOT NULL COMMENT 'SHA-256校验和',
                \`applied_time\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '应用时间',
                PRIMARY KEY (\`filename\`)
            ) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '账号库Schema增量记录表'`
        )

        const changesDirectory = resolveChangesDirectory()
        const filenames = (await readdir(changesDirectory)).filter(filename => filename.endsWith('.sql')).sort()
        for (const filename of filenames) {
            const sql = await readFile(path.join(changesDirectory, filename), 'utf8')
            const checksum = createHash('sha256').update(sql).digest('hex')
            const [rows] = await connection.execute<MigrationRow[]>(
                `SELECT \`checksum\` FROM \`${MIGRATION_TABLE}\` WHERE \`filename\` = ?`,
                [filename]
            )
            if (rows.length) {
                if (rows[0].checksum !== checksum) {
                    throw new Error(`已应用的增量 SQL 校验和发生变化：${filename}`)
                }
                process.stdout.write(`Schema migration skipped: ${filename}\n`)
                continue
            }

            await connection.query(sql)
            await connection.execute(`INSERT INTO \`${MIGRATION_TABLE}\` (\`filename\`, \`checksum\`) VALUES (?, ?)`, [filename, checksum])
            process.stdout.write(`Schema migration applied: ${filename}\n`)
        }
    } finally {
        await connection.end()
    }
}

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
})
