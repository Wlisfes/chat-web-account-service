/** Nacos 中 database.chat-web-account 节点的配置结构。 */
export interface AccountMysqlConfig {
    host: string
    port: number | string
    username: string
    password: string
    /** 数据库名称；优先使用 database，兼容现有 Nacos 的 name 字段。 */
    database?: string
    name?: string
    charset?: string
    timezone?: string
    logging?: boolean | string
    poolSize?: number | string
    connectTimeout?: number | string
    retryAttempts?: number | string
    retryDelay?: number | string
}
