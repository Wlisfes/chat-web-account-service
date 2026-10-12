import { randomBytes } from 'node:crypto'
import mysql, { RowDataPacket } from 'mysql2/promise'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import { applySchema } from '@/cli/apply-schema'
import { DatabaseConfig, getDatabaseName, loadLocalEnvironment, loadTaskDatabaseConfig } from '@/cli/database-config'

const MIGRATION_USER_PREFIX = 'task_mig_'
const MYSQL_ACCOUNT_HOST = '%'

type MigrationCredentials = {
    username: string
    password: string
}

/** 组装已选中 Task 数据库的管理员连接参数，供兼容性检查和账号授权使用。 */
export function createAdminConnectionOptions(config: DatabaseConfig, database: string): mysql.ConnectionOptions {
    const host = process.env.TASK_MYSQL_HOST?.trim() || config.host
    const port = Number(process.env.TASK_MYSQL_PORT || config.port || 3306)

    return {
        host,
        port,
        user: process.env.TASK_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.TASK_MYSQL_PASSWORD ?? config.password,
        database,
        charset: process.env.TASK_MYSQL_CHARSET || config.charset || 'utf8mb4'
    }
}

/** 生成长度符合 MySQL 账号限制的临时迁移账号。 */
export function createMigrationCredentials(random = randomBytes(18)): MigrationCredentials {
    const suffix = random.toString('hex')
    return {
        username: `${MIGRATION_USER_PREFIX}${suffix}`.slice(0, 32),
        password: randomBytes(32).toString('base64url')
    }
}

/** 使用管理员账号创建仅能访问 Task 数据库的临时迁移账号。 */
export async function createMigrationUser(
    connection: mysql.Connection,
    database: string,
    credentials: MigrationCredentials
): Promise<void> {
    const account = `${mysql.escape(credentials.username)}@${mysql.escape(MYSQL_ACCOUNT_HOST)}`
    await connection.query(`CREATE USER ${account} IDENTIFIED BY ${mysql.escape(credentials.password)}`)
    await connection.query(`GRANT ALL PRIVILEGES ON ${mysql.escapeId(database)}.* TO ${account}`)
}

/** 判断配置账号是否已是仅能访问 Task 数据库的单库账号；单库账号无需也无权创建临时账号。 */
export async function isIsolatedDatabaseAccount(connection: mysql.Connection, database: string): Promise<boolean> {
    const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
    const grants = grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string'))
    try {
        assertMysqlDatabaseIsolation(grants, database)
        return true
    } catch {
        return false
    }
}

/** 删除临时迁移账号，避免管理员账号授权长期留存。 */
export async function dropMigrationUser(connection: mysql.Connection, credentials: MigrationCredentials): Promise<void> {
    const account = `${mysql.escape(credentials.username)}@${mysql.escape(MYSQL_ACCOUNT_HOST)}`
    await connection.query(`DROP USER IF EXISTS ${account}`)
}

/** 使用 Nacos 中的管理员连接临时授权，再以受限账号执行 Schema。 */
async function main(): Promise<void> {
    loadLocalEnvironment()
    const config = await loadTaskDatabaseConfig()
    const database = getDatabaseName(config)
    const adminConnectionOptions = createAdminConnectionOptions(config, database)
    const adminConnection = await mysql.createConnection(adminConnectionOptions)
    if (await isIsolatedDatabaseAccount(adminConnection, database)) {
        await adminConnection.end()
        await applySchema()
        return
    }
    const credentials = createMigrationCredentials()

    try {
        await createMigrationUser(adminConnection, database, credentials)
        const previousEnvironment = {
            host: process.env.TASK_MYSQL_HOST,
            port: process.env.TASK_MYSQL_PORT,
            username: process.env.TASK_MYSQL_USERNAME,
            password: process.env.TASK_MYSQL_PASSWORD,
            database: process.env.TASK_MYSQL_DATABASE
        }
        process.env.TASK_MYSQL_HOST = String(adminConnectionOptions.host)
        process.env.TASK_MYSQL_PORT = String(adminConnectionOptions.port)
        process.env.TASK_MYSQL_USERNAME = credentials.username
        process.env.TASK_MYSQL_PASSWORD = credentials.password
        process.env.TASK_MYSQL_DATABASE = database
        try {
            await applySchema()
        } finally {
            for (const [key, value] of Object.entries(previousEnvironment)) {
                if (value === undefined) delete process.env[key]
                else process.env[key] = value
            }
        }
    } finally {
        try {
            await dropMigrationUser(adminConnection, credentials)
        } finally {
            await adminConnection.end()
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
