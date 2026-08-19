import { randomBytes } from 'node:crypto'
import yaml from 'js-yaml'
import mysql, { Connection, RowDataPacket } from 'mysql2/promise'

type DatabaseConfig = {
    host: string
    port?: number | string
    username: string
    password: string
    database?: string
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

function nacosParameters(dataId: string): URLSearchParams {
    return new URLSearchParams({
        dataId,
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
}

async function readNacosConfig(dataId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${nacosBaseUrl()}/nacos/v1/cs/configs?${nacosParameters(dataId)}`)
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：dataId=${dataId}, HTTP ${response.status}`)
    const config = yaml.load(await response.text())
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Nacos 配置格式无效：${dataId}`)
    return config as Record<string, unknown>
}

async function publishNacosConfig(dataId: string, config: Record<string, unknown>): Promise<void> {
    const body = nacosParameters(dataId)
    body.set('type', 'yaml')
    body.set('content', yaml.dump(config, { noRefs: true, lineWidth: 160 }))
    const response = await fetch(`${nacosBaseUrl()}/nacos/v1/cs/configs`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body
    })
    if (!response.ok || (await response.text()).trim() !== 'true') {
        throw new Error(`发布 Nacos 配置失败：dataId=${dataId}, HTTP ${response.status}`)
    }
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

async function isolateService(boundary: ServiceBoundary): Promise<'already-isolated' | 'migrated'> {
    const root = await readNacosConfig(boundary.dataId)
    const { config, database } = getDatabaseConfig(root, boundary)
    const source = await connect(config, database)
    const grants = await getGrants(source)
    if (grantsAreIsolated(grants, database)) {
        await source.end()
        process.stdout.write(`Database account already isolated: ${database}\n`)
        return 'already-isolated'
    }

    const password = randomBytes(36).toString('base64url')
    const principal = `\`${boundary.username}\`@\`%\``
    try {
        await source.query(`CREATE USER IF NOT EXISTS ${principal} IDENTIFIED BY ?`, [password])
        await source.query(`ALTER USER ${principal} IDENTIFIED BY ?`, [password])
        await source.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${principal}`)
        await source.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ${principal}`)
    } finally {
        await source.end()
    }

    config.name = database
    delete config.database
    config.username = boundary.username
    config.password = password
    await publishNacosConfig(boundary.dataId, root)

    const verification = await connect(config, database)
    try {
        if (!grantsAreIsolated(await getGrants(verification), database)) {
            throw new Error(`专用数据库账号授权验证失败：${database}`)
        }
    } finally {
        await verification.end()
    }
    process.stdout.write(`Database account migrated and isolated: ${database}\n`)
    return 'migrated'
}

async function main(): Promise<void> {
    for (const boundary of SERVICES) await isolateService(boundary)
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

export { grantsAreIsolated }
