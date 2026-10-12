import { loadEnvFile } from 'node:process'
import yaml from 'js-yaml'

export type DatabaseConfig = {
    host: string
    port?: number | string
    username: string
    password: string
    database?: string
    name?: string
    charset?: string
    timezone?: string
}

/** 尝试加载当前目录的本地环境变量文件。 */
export function loadLocalEnvironment(): void {
    try {
        loadEnvFile()
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

function required(key: string): string {
    const value = process.env[key]?.trim()
    if (!value) throw new Error(`缺少环境变量：${key}`)
    return value
}

async function getNacosAccessToken(baseUrl: string): Promise<string | undefined> {
    const username = process.env.NACOS_USERNAME?.trim()
    const password = process.env.NACOS_PASSWORD
    if (!username || password === undefined) return undefined

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/nacos/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
    })
    if (!response.ok) throw new Error(`Nacos 鉴权失败：HTTP ${response.status}`)
    const result = (await response.json()) as { accessToken?: unknown }
    if (typeof result.accessToken !== 'string' || !result.accessToken.trim()) {
        throw new Error('Nacos 鉴权响应缺少 accessToken')
    }
    return result.accessToken
}

/** 校验数据库名，避免把配置值拼接进 SQL 时产生注入风险。 */
export function identifier(value: string, label: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label}只能包含字母、数字、下划线和连字符`)
    return value
}

/** 读取 Task 数据库配置；本地显式覆盖优先于 Nacos。 */
export async function loadTaskDatabaseConfig(): Promise<DatabaseConfig> {
    const directHost = process.env.TASK_MYSQL_HOST?.trim()
    const directUser = process.env.TASK_MYSQL_USERNAME?.trim()
    const directPassword = process.env.TASK_MYSQL_PASSWORD
    const directDatabase = process.env.TASK_MYSQL_DATABASE?.trim()
    if (directHost && directUser && directPassword !== undefined && directDatabase) {
        return {
            host: directHost,
            port: process.env.TASK_MYSQL_PORT || 3306,
            username: directUser,
            password: directPassword,
            database: directDatabase,
            charset: process.env.TASK_MYSQL_CHARSET || 'utf8mb4',
            timezone: process.env.TASK_MYSQL_TIMEZONE || '+08:00'
        }
    }

    const server = required('NACOS_SERVER')
    const baseUrl = /^https?:\/\//i.test(server) ? server : `http://${server}`
    const params = new URLSearchParams({
        dataId: required('NACOS_CONFIG_DATA_ID'),
        group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
        tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
    })
    const accessToken = await getNacosAccessToken(baseUrl)
    if (accessToken) params.set('accessToken', accessToken)

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/nacos/v1/cs/configs?${params}`)
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：HTTP ${response.status}`)
    const parsed = yaml.load(await response.text()) as Record<string, unknown>
    const databaseRoot = parsed?.database as Record<string, unknown> | undefined
    const database = databaseRoot?.['chat-web-task']
    if (!database || typeof database !== 'object' || Array.isArray(database)) {
        throw new Error('缺少 Nacos 数据库配置节点：database.chat-web-task')
    }
    return database as DatabaseConfig
}

/** 获取并校验 Task 数据库名称。 */
export function getDatabaseName(config: DatabaseConfig): string {
    const name = process.env.TASK_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim()
    if (!name) throw new Error('Task 数据库名称不能为空')
    return identifier(name, 'Task 数据库名称')
}
