import { Faker, zh_CN } from '@faker-js/faker'
import { assertMysqlDatabaseIsolation } from '@wlisfes/chat-web-base-schema/database'
import {
    TbAccountConsumerAuthStatus,
    TbAccountConsumerClassType,
    TbAccountConsumerPayMode,
    TbAccountConsumerSource,
    TbAccountConsumerStage,
    TbAccountConsumerStatus,
    TbAccountUserStatus
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'
import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { loadDatabaseConfig } from '@/cli/migrate-legacy-platform'

export const CONSUMER_DEMO_SEED = 20260822
export const CONSUMER_DEMO_COUNT = 120
export const CONSUMER_DEMO_OWNER_LIMIT = 20
export const CONSUMER_DEMO_UID_BASE = 2026082251810000000n
export const CONSUMER_DEMO_OWNER_QUERY = `SELECT \`uid\` FROM \`tb_account_user\` WHERE \`status\` = ? ORDER BY \`uid\` ASC LIMIT ${CONSUMER_DEMO_OWNER_LIMIT}`

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'SGD', 'INR', 'JPY', 'KRW', 'IDR', 'THB', 'MYR', 'VND', 'PHP'] as const
const STAGES = Object.values(TbAccountConsumerStage)
const AUTH_STATUSES = Object.values(TbAccountConsumerAuthStatus)

export type ConsumerDemoRow = {
    uid: string
    ownerUserUid: string
    name: string
    alias: string
    brandKeyId: number
    currency: string
    email: string
    phone: string
    status: TbAccountConsumerStatus
    payMode: TbAccountConsumerPayMode
    classType: TbAccountConsumerClassType
    balance: number
    balanceUsd: number
    credit: number
    creditUsd: number
    level: number
    stage: TbAccountConsumerStage
    authStatus: TbAccountConsumerAuthStatus
    source: TbAccountConsumerSource
    remark: string
}

export type ConsumerDemoSeedResult = {
    target: number
    existing: number
    pending: number
    inserted: number
    updated: number
    ownerCount: number
}

export function createConsumerDemoRows(
    ownerUserUids: readonly string[],
    count = CONSUMER_DEMO_COUNT,
    seed = CONSUMER_DEMO_SEED
): ConsumerDemoRow[] {
    const owners = [...new Set(ownerUserUids.map(uid => uid.trim()).filter(uid => /^\d{1,19}$/.test(uid)))]
    if (owners.length < 2) throw new Error('生成客户演示数据至少需要两个有效归属账号')
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('客户演示数据数量必须是1-1000之间的整数')

    const faker = new Faker({ locale: zh_CN })
    faker.seed(seed)
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1
        const amount = faker.number.int({ min: 500, max: 500_000 }) * 1_000_000
        const credit = faker.number.int({ min: 1_000, max: 1_000_000 }) * 1_000_000
        return {
            uid: (CONSUMER_DEMO_UID_BASE + BigInt(index)).toString(),
            ownerUserUid: owners[index % owners.length],
            name: `演示客户-${String(sequence).padStart(3, '0')}-${faker.company.name()}`.slice(0, 64),
            alias: `DEMO-${String(sequence).padStart(3, '0')}`,
            brandKeyId: (index % 11) + 1,
            currency: CURRENCIES[index % CURRENCIES.length],
            email: `demo-consumer-${String(sequence).padStart(3, '0')}@example.test`,
            phone: faker.helpers.fromRegExp('1[3-9][0-9]{9}'),
            status: index % 17 === 0 ? TbAccountConsumerStatus.DISABLE : TbAccountConsumerStatus.ENABLE,
            payMode: index % 3 === 0 ? TbAccountConsumerPayMode.POSTPAID : TbAccountConsumerPayMode.PREPAID,
            classType: index % 5 === 0 ? TbAccountConsumerClassType.COOPERATE : TbAccountConsumerClassType.COMMON,
            balance: amount,
            balanceUsd: faker.number.int({ min: 100, max: 100_000 }) * 1_000_000,
            credit,
            creditUsd: faker.number.int({ min: 500, max: 200_000 }) * 1_000_000,
            level: (index % 5) + 1,
            stage: STAGES[index % STAGES.length],
            authStatus: AUTH_STATUSES[index % AUTH_STATUSES.length],
            source: index % 4 === 0 ? TbAccountConsumerSource.PLATFORM : TbAccountConsumerSource.MANUAL,
            remark: faker.helpers.arrayElement(['重点跟进客户', '国际短信业务客户', '跨境通信演示客户', '企业消息演示客户'])
        }
    })
}

export function shouldApplyConsumerDemoSeed(argumentsList: readonly string[]): boolean {
    return argumentsList.includes('--apply')
}

async function existingDemoConsumers(connection: Connection, rows: readonly ConsumerDemoRow[]): Promise<Map<string, number>> {
    if (!rows.length) return new Map()
    const placeholders = rows.map(() => '?').join(',')
    const [existingRows] = await connection.execute<(RowDataPacket & { uid: string; brandKeyId: number })[]>(
        `SELECT \`uid\`, \`brand_key_id\` AS \`brandKeyId\` FROM \`tb_account_consumer\` WHERE \`uid\` IN (${placeholders})`,
        rows.map(row => row.uid)
    )
    return new Map(existingRows.map(row => [String(row.uid), Number(row.brandKeyId)]))
}

export async function seedConsumerDemoData(
    connection: Connection,
    apply: boolean,
    rows: readonly ConsumerDemoRow[]
): Promise<ConsumerDemoSeedResult> {
    const existingConsumers = await existingDemoConsumers(connection, rows)
    const pendingRows = rows.filter(row => !existingConsumers.has(row.uid))
    const updateRows = rows.filter(row => existingConsumers.has(row.uid) && existingConsumers.get(row.uid) !== row.brandKeyId)
    const ownerCount = new Set(rows.map(row => row.ownerUserUid)).size
    const result = {
        target: rows.length,
        existing: existingConsumers.size,
        pending: pendingRows.length + updateRows.length,
        inserted: 0,
        updated: 0,
        ownerCount
    }
    if (!apply || (!pendingRows.length && !updateRows.length)) return result

    const insertSql = `INSERT INTO \`tb_account_consumer\`
        (\`uid\`,\`owner_user_uid\`,\`name\`,\`alias\`,\`brand_key_id\`,\`currency\`,\`email\`,\`phone\`,\`status\`,\`pay_mode\`,\`class_type\`,\`balance\`,\`balance_usd\`,\`credit\`,\`credit_usd\`,\`level\`,\`stage\`,\`auth_status\`,\`source\`,\`remark\`)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    await connection.beginTransaction()
    try {
        for (const row of pendingRows) {
            await connection.execute(insertSql, [
                row.uid,
                row.ownerUserUid,
                row.name,
                row.alias,
                row.brandKeyId,
                row.currency,
                row.email,
                row.phone,
                row.status,
                row.payMode,
                row.classType,
                row.balance,
                row.balanceUsd,
                row.credit,
                row.creditUsd,
                row.level,
                row.stage,
                row.authStatus,
                row.source,
                row.remark
            ])
        }
        for (const row of updateRows) {
            const [updateResult] = await connection.execute<ResultSetHeader>(
                'UPDATE `tb_account_consumer` SET `brand_key_id` = ? WHERE `uid` = ? AND `brand_key_id` <> ?',
                [row.brandKeyId, row.uid, row.brandKeyId]
            )
            result.updated += updateResult.affectedRows
        }
        await connection.commit()
        result.inserted = pendingRows.length
        return result
    } catch (error) {
        await connection.rollback()
        throw error
    }
}

async function main(): Promise<void> {
    const apply = shouldApplyConsumerDemoSeed(process.argv.slice(2))
    const config = await loadDatabaseConfig()
    const database = process.env.ACCOUNT_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim()
    if (!database) throw new Error('账号数据库名称不能为空')
    const connection = await mysql.createConnection({
        host: process.env.ACCOUNT_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.ACCOUNT_MYSQL_PORT || config.port || 3306),
        user: process.env.ACCOUNT_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.ACCOUNT_MYSQL_PASSWORD ?? config.password,
        database,
        charset: process.env.ACCOUNT_MYSQL_CHARSET || config.charset || 'utf8mb4',
        timezone: process.env.ACCOUNT_MYSQL_TIMEZONE || config.timezone || '+08:00',
        supportBigNumbers: true,
        bigNumberStrings: true
    })
    try {
        const [grantRows] = await connection.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()')
        assertMysqlDatabaseIsolation(
            grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string')),
            database
        )
        const [ownerRows] = await connection.execute<(RowDataPacket & { uid: string })[]>(CONSUMER_DEMO_OWNER_QUERY, [
            TbAccountUserStatus.ENABLED
        ])
        const rows = createConsumerDemoRows(ownerRows.map(row => String(row.uid)))
        const result = await seedConsumerDemoData(connection, apply, rows)
        process.stdout.write(
            `${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', seed: CONSUMER_DEMO_SEED, database, ...result }, null, 2)}\n`
        )
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
