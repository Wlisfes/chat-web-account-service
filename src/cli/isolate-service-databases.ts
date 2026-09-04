import yaml from 'js-yaml'
import mysql, { Connection, RowDataPacket } from 'mysql2/promise'
import { getNacosAccessToken, withNacosAccessToken } from '@/cli/nacos-auth'

type DatabaseConfig = {
    host: string
    port?: number | string
    username: string
    password: string
    database?: string
    /** 兼容历史 Nacos 配置中的 name 字段；读取时同时支持 database。 */
    name?: string
    charset?: string
    timezone?: string
}

type ServiceBoundary = {
    dataId: string
    configKey: string
    databases: readonly string[]
    username: string
}

const SERVICES: readonly ServiceBoundary[] = [
    {
        dataId: 'chat-web-account-service.yaml',
        configKey: 'chat-web-account',
        databases: ['chat_web_account', 'chat-web-account'],
        username: 'chat_web_account_service'
    },
    {
        dataId: 'chat-web-finance-service.yaml',
        configKey: 'chat-web-finance',
        databases: ['chat_web_finance', 'chat-web-finance'],
        username: 'chat_web_finance_service'
    }
]

function required(key: string): string {
    const value = process.env[key]?.trim()
    if (!value) throw new Error(`缺少环境变量：${key}`)
    return value
}

function nacosBaseUrl(): string {
    const server = required('NACOS_SERVER')
    return (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/$/, '')
}

async function nacosParameters(dataId: string): Promise<URLSearchParams> {
    const parameters = new URLSearchParams({
        dataId,
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
    return withNacosAccessToken(parameters, await getNacosAccessToken(nacosBaseUrl()))
}

async function readNacosConfig(dataId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${nacosBaseUrl()}/nacos/v1/cs/configs?${await nacosParameters(dataId)}`)
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：dataId=${dataId}, HTTP ${response.status}`)
    const config = yaml.load(await response.text())
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Nacos 配置格式无效：${dataId}`)
    return config as Record<string, unknown>
}

function getDatabaseConfig(root: Record<string, unknown>, boundary: ServiceBoundary): { config: DatabaseConfig; database: string } {
    const databases = root.database
    if (!databases || typeof databases !== 'object' || Array.isArray(databases)) {
        throw new Error(`缺少 Nacos 数据库配置根节点：${boundary.dataId}`)
    }
    const config = (databases as Record<string, unknown>)[boundary.configKey]
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error(`缺少 Nacos 数据库配置：database.${boundary.configKey}`)
    }
    const database = config as DatabaseConfig
    const databaseName = database.database?.trim() || database.name?.trim()
    if (!databaseName || !boundary.databases.includes(databaseName)) {
        throw new Error(`${boundary.configKey} 数据库必须是 ${boundary.databases.join(' 或 ')}`)
    }
    if (!database.host?.trim() || !database.username?.trim() || typeof database.password !== 'string') {
        throw new Error(`${boundary.configKey} 数据库连接配置不完整`)
    }
    return { config: database, database: databaseName }
}

async function connect(config: DatabaseConfig, database: string): Promise<Connection> {
    return mysql.createConnection({
        host: config.host,
        port: Number(config.port || 3306),
        user: config.username,
        password: config.password,
        database,
        charset: config.charset || 'utf8mb4'
    })
}

async function getGrants(connection: Connection): Promise<string[]> {
    const [rows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
    return rows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string'))
}

function grantsAreIsolated(grants: readonly string[], database: string): boolean {
    if (!grants.length) return false
    const ownTarget = `\`${database}\`.*`
    return grants.every(statement => {
        const match = statement.match(/^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+/i)
        if (!match) return false
        const privileges = match[1].trim().toUpperCase()
        const target = match[2].trim()
        return target === '*.*' ? privileges === 'USAGE' : target === ownTarget
    })
}

async function verifyServiceDatabase(boundary: ServiceBoundary): Promise<void> {
    // Nacos 是人工维护的配置源。部署过程只读取并验证，绝不生成凭据或回写配置，
    // 因而可以完整保留用户填写的字段名称、顺序和注释。
    const root = await readNacosConfig(boundary.dataId)
    const { config, database } = getDatabaseConfig(root, boundary)
    const connection = await connect(config, database)
    try {
        const grants = await getGrants(connection)
        if (!grantsAreIsolated(grants, database)) {
            throw new Error(
                `${boundary.configKey} 数据库账号权限未隔离：仅允许 USAGE ON *.* 和 ${database}.*；请在数据库/Nacos 中人工配置专用账号后重新部署`
            )
        }
    } finally {
        await connection.end()
    }
    process.stdout.write(`Database account verified: ${database}\n`)
}

async function main(): Promise<void> {
    for (const boundary of SERVICES) await verifyServiceDatabase(boundary)
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

export { grantsAreIsolated }
