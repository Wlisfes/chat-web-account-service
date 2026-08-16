import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { ACCOUNT_MYSQL_CONFIG_KEY, ACCOUNT_MYSQL_ENTITIES } from '@/modules/database/database.constants'
import { AccountMysqlConfig } from '@/modules/database/database.interface'

type MysqlConfigRecord = Record<keyof AccountMysqlConfig, unknown>

function getRequiredString(config: MysqlConfigRecord, key: keyof AccountMysqlConfig): string {
    const value = config[key]
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`数据库配置 ${ACCOUNT_MYSQL_CONFIG_KEY}.${key} 必须是非空字符串`)
    }
    return value.trim()
}

function getOptionalString(config: MysqlConfigRecord, key: keyof AccountMysqlConfig, fallback: string): string {
    const value = config[key]
    if (value === undefined || value === null || value === '') {
        return fallback
    }
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`数据库配置 ${ACCOUNT_MYSQL_CONFIG_KEY}.${key} 必须是字符串`)
    }
    return value.trim()
}

function getDatabaseName(config: MysqlConfigRecord): string {
    const value = config.database ?? config.name
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`数据库配置 ${ACCOUNT_MYSQL_CONFIG_KEY}.database 或 name 必须是非空字符串`)
    }
    return value.trim()
}

function getInteger(
    config: MysqlConfigRecord,
    key: keyof AccountMysqlConfig,
    fallback: number,
    minimum: number,
    maximum = Number.MAX_SAFE_INTEGER
): number {
    const value = config[key]
    const result = value === undefined || value === null || value === '' ? fallback : Number(value)
    if (!Number.isInteger(result) || result < minimum || result > maximum) {
        throw new Error(`数据库配置 ${ACCOUNT_MYSQL_CONFIG_KEY}.${key} 必须是 ${minimum}-${maximum} 之间的整数`)
    }
    return result
}

function getBoolean(config: MysqlConfigRecord, key: keyof AccountMysqlConfig, fallback: boolean): boolean {
    const value = config[key]
    if (value === undefined || value === null || value === '') {
        return fallback
    }
    if (typeof value === 'boolean') {
        return value
    }
    if (value === 'true' || value === 'false') {
        return value === 'true'
    }
    throw new Error(`数据库配置 ${ACCOUNT_MYSQL_CONFIG_KEY}.${key} 必须是布尔值`)
}

function getEnvironmentString(configService: ConfigService, key: string): string | undefined {
    const value = configService.get<string>(key)
    if (value === undefined || value === null || value === '') {
        return undefined
    }
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`环境变量 ${key} 必须是非空字符串`)
    }
    return value.trim()
}

function getEnvironmentPort(configService: ConfigService): number | undefined {
    const value = configService.get<string | number>('ACCOUNT_MYSQL_PORT')
    if (value === undefined || value === null || value === '') {
        return undefined
    }
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('环境变量 ACCOUNT_MYSQL_PORT 必须是 1-65535 之间的整数')
    }
    return port
}

/** 根据已经加载到 ConfigService 的 Nacos 配置创建账号数据库连接选项。 */
export function createAccountMysqlOptions(configService: ConfigService): TypeOrmModuleOptions {
    const config = configService.get<unknown>(ACCOUNT_MYSQL_CONFIG_KEY)
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error(`缺少 Nacos 数据库配置节点：${ACCOUNT_MYSQL_CONFIG_KEY}`)
    }

    const mysqlConfig = config as MysqlConfigRecord
    return {
        type: 'mysql',
        connectorPackage: 'mysql2',
        host: getEnvironmentString(configService, 'ACCOUNT_MYSQL_HOST') ?? getRequiredString(mysqlConfig, 'host'),
        port: getEnvironmentPort(configService) ?? getInteger(mysqlConfig, 'port', 3306, 1, 65535),
        username: getRequiredString(mysqlConfig, 'username'),
        password: getRequiredString(mysqlConfig, 'password'),
        database: getEnvironmentString(configService, 'ACCOUNT_MYSQL_DATABASE') ?? getDatabaseName(mysqlConfig),
        charset: getOptionalString(mysqlConfig, 'charset', 'utf8mb4'),
        timezone: getOptionalString(mysqlConfig, 'timezone', '+08:00'),
        logging: getBoolean(mysqlConfig, 'logging', false),
        poolSize: getInteger(mysqlConfig, 'poolSize', 10, 1, 1000),
        connectTimeout: getInteger(mysqlConfig, 'connectTimeout', 10000, 1),
        retryAttempts: getInteger(mysqlConfig, 'retryAttempts', 5, 0, 100),
        retryDelay: getInteger(mysqlConfig, 'retryDelay', 3000, 0),
        supportBigNumbers: true,
        bigNumberStrings: true,
        entities: [...ACCOUNT_MYSQL_ENTITIES],
        synchronize: false,
        migrationsRun: false
    }
}
