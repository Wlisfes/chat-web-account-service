const test = require('node:test')
const assert = require('node:assert/strict')

const { buildTree, assertValidTree } = require('../dist/common/tree')
const { generateUid } = require('../dist/common/uid')
const { PasswordService } = require('../dist/modules/auth/password.service')
const { TokenService } = require('../dist/modules/auth/token.service')
const { HealthService } = require('../dist/modules/health/health.service')
const { selectEffectiveScopeRules } = require('../dist/modules/permissions/permissions.policy')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

test('组织和菜单树按 sort 排序并保留层级', () => {
    const nodes = [
        { uid: '3', parentUid: '1', sort: 20 },
        { uid: '1', parentUid: undefined, sort: 10 },
        { uid: '2', parentUid: '1', sort: 10 }
    ]
    assertValidTree(nodes, '测试树')
    const tree = buildTree(nodes)
    assert.deepEqual(
        tree.map(node => node.uid),
        ['1']
    )
    assert.deepEqual(
        tree[0].children.map(node => node.uid),
        ['2', '3']
    )
})

test('树校验拒绝循环和缺失父节点', () => {
    assert.throws(() => assertValidTree([{ uid: '1', parentUid: '2', sort: 0 }], '测试树'), /父节点/)
    assert.throws(
        () =>
            assertValidTree(
                [
                    { uid: '1', parentUid: '2', sort: 0 },
                    { uid: '2', parentUid: '1', sort: 0 }
                ],
                '测试树'
            ),
        /循环层级/
    )
})

test('业务UID为不超过19位的正数字字符串', () => {
    const values = new Set(Array.from({ length: 1000 }, () => generateUid()))
    assert.equal(values.size, 1000)
    for (const value of values) {
        assert.match(value, /^\d{1,19}$/)
        assert.notEqual(value, '0')
    }
})

test('scrypt 密码哈希可校验正确密码并拒绝错误密码', async () => {
    const service = new PasswordService()
    const encoded = await service.hash('Correct-Horse-2026')
    assert.match(encoded, /^scrypt-v1\$/)
    assert.equal(await service.verify('Correct-Horse-2026', encoded), true)
    assert.equal(await service.verify('wrong-password', encoded), false)
    assert.equal(await service.verify('Correct-Horse-2026', 'invalid'), false)
})

test('JWT 可验证且拒绝篡改和不同密钥', () => {
    const values = {
        JWT_SECRET: '0123456789abcdef0123456789abcdef',
        'security.jwt.issuer': 'test-issuer',
        'security.jwt.audience': 'test-audience',
        'security.jwt.accessTokenTtlSeconds': 600
    }
    const service = new TokenService(config(values))
    const token = service.issueAccessToken('2149446185344106496')
    assert.equal(service.verifyAccessToken(token.accessToken).sub, '2149446185344106496')
    const parts = token.accessToken.split('.')
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`
    assert.throws(() => service.verifyAccessToken(parts.join('.')), /签名/)

    const otherService = new TokenService(config({ ...values, JWT_SECRET: 'abcdef0123456789abcdef0123456789' }))
    assert.throws(() => otherService.verifyAccessToken(token.accessToken), /签名/)
})

test('资源专属数据范围覆盖同角色的默认规则，不影响其他角色并集', () => {
    const roles = [{ uid: 'role-a' }, { uid: 'role-b' }]
    const rules = [
        { id: 'a-default', roleUid: 'role-a', resourceCode: '*' },
        { id: 'a-user', roleUid: 'role-a', resourceCode: 'account:user' },
        { id: 'b-default', roleUid: 'role-b', resourceCode: '*' }
    ]
    assert.deepEqual(
        selectEffectiveScopeRules(roles, rules, 'account:user').map(rule => rule.id),
        ['a-user', 'b-default']
    )
})

test('就绪检查会报告缺失的数据库表', async () => {
    const service = new HealthService({
        isInitialized: true,
        entityMetadatas: [{ tableName: 'table_a' }, { tableName: 'table_b' }],
        async query() {
            return [{ tableName: 'table_a' }]
        }
    })
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['table_b'])
})
