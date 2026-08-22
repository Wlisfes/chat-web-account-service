const test = require('node:test')
const assert = require('node:assert/strict')

const {
    ACCOUNT_CONSUMER_TARGET_TABLE,
    LEGACY_CONSUMER_SOURCE_TABLE,
    buildLegacyConsumerInsertSql,
    migrateLegacyConsumers
} = require('../dist/cli/migrate-legacy-consumers')

function fakeConnection() {
    const state = { committed: false, rolledBack: false, inserts: [] }
    return {
        state,
        async execute(sql, parameters) {
            if (sql.includes('information_schema.tables')) return [[{ count: parameters[1] ? 1 : 0 }]]
            throw new Error(`Unexpected execute: ${sql}`)
        },
        async query(sql) {
            if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: sql.includes('legacy_windows') ? 2 : 0 }]]
            if (sql.startsWith('INSERT INTO')) {
                state.inserts.push(sql)
                return [{ affectedRows: 2 }]
            }
            throw new Error(`Unexpected query: ${sql}`)
        },
        async beginTransaction() {},
        async commit() {
            state.committed = true
        },
        async rollback() {
            state.rolledBack = true
        }
    }
}

test('旧客户迁移写入账号域并默认回滚', async () => {
    assert.equal(LEGACY_CONSUMER_SOURCE_TABLE, 'tb_windows_client')
    assert.equal(ACCOUNT_CONSUMER_TARGET_TABLE, 'tb_account_consumer')
    const connection = fakeConnection()
    const count = await migrateLegacyConsumers(connection, 'legacy_windows', 'chat_web_account', false)
    assert.equal(count, 2)
    assert.equal(connection.state.committed, false)
    assert.equal(connection.state.rolledBack, true)
    assert.equal(connection.state.inserts.length, 1)
    assert.match(connection.state.inserts[0], /CAST\(`key_id` AS CHAR\)/)
    assert.match(connection.state.inserts[0], /`userId`.*`brand_id`/s)
})

test('旧客户迁移只有显式 apply 才提交', async () => {
    const connection = fakeConnection()
    await migrateLegacyConsumers(connection, 'legacy_windows', 'chat_web_account', true)
    assert.equal(connection.state.committed, true)
    assert.equal(connection.state.rolledBack, false)
})

test('迁移 SQL 不写入 Finance 客户表', () => {
    const sql = buildLegacyConsumerInsertSql('legacy_windows', 'chat_web_account')
    assert.match(sql, /`chat_web_account`\.`tb_account_consumer`/)
    assert.doesNotMatch(sql, /tb_finance_client/)
})
