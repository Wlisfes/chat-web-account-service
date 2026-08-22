const test = require('node:test')
const assert = require('node:assert/strict')

const {
    CONSUMER_DEMO_COUNT,
    CONSUMER_DEMO_OWNER_QUERY,
    CONSUMER_DEMO_UID_BASE,
    createConsumerDemoRows,
    shouldApplyConsumerDemoSeed
} = require('../dist/cli/seed-demo-consumer')

test('归属人查询使用固定安全上限，兼容 MySQL prepared statement', () => {
    assert.match(CONSUMER_DEMO_OWNER_QUERY, /LIMIT 20$/)
    assert.equal((CONSUMER_DEMO_OWNER_QUERY.match(/\?/g) ?? []).length, 1)
})

test('客户演示数据从固定 UID 生成并均匀分配给多个归属人', () => {
    const owners = ['2026082200000000001', '2026082200000000002', '2026082200000000003', '2026082200000000004']
    const rows = createConsumerDemoRows(owners)

    assert.equal(rows.length, CONSUMER_DEMO_COUNT)
    assert.equal(rows[0].uid, CONSUMER_DEMO_UID_BASE.toString())
    assert.equal(new Set(rows.map(row => row.uid)).size, CONSUMER_DEMO_COUNT)
    assert.deepEqual([...new Set(rows.map(row => row.ownerUserUid))], owners)
    for (const owner of owners) assert.equal(rows.filter(row => row.ownerUserUid === owner).length, CONSUMER_DEMO_COUNT / owners.length)
    assert.ok(rows.every(row => row.brandKeyId >= 1 && row.brandKeyId <= 12))
    assert.ok(rows.every(row => /^demo-consumer-\d{3}@example\.test$/.test(row.email)))
})

test('客户演示数据默认 dry-run，只有显式 apply 才提交', () => {
    assert.equal(shouldApplyConsumerDemoSeed([]), false)
    assert.equal(shouldApplyConsumerDemoSeed(['--apply']), true)
})

test('客户演示数据拒绝只有一个归属人的配置', () => {
    assert.throws(() => createConsumerDemoRows(['2026082200000000001']), /至少需要两个/)
})
