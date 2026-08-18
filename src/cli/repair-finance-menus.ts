import { loadEnvFile } from 'node:process'
import mysql from 'mysql2/promise'
import { loadDatabaseConfig } from '@/cli/migrate-legacy-platform'
import { repairFinanceMenus } from '@/cli/finance-menu.seed'

async function main(): Promise<void> {
    try {
        loadEnvFile()
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const apply = process.argv.includes('--apply')
    const config = await loadDatabaseConfig()
    const database = process.env.ACCOUNT_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim()
    if (!database) throw new Error('数据库名称不能为空')
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
        await connection.beginTransaction()
        try {
            const result = await repairFinanceMenus(connection)
            if (apply) await connection.commit()
            else await connection.rollback()
            process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }, null, 2)}\n`)
        } catch (error) {
            await connection.rollback()
            throw error
        }
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
