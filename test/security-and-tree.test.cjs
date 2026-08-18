const test = require('node:test')
const assert = require('node:assert/strict')

const { buildTree, assertValidTree } = require('../dist/common/tree')
const { generateUid } = require('../dist/common/uid')
const { PasswordService } = require('../dist/modules/auth/password.service')
const { TokenService } = require('../dist/modules/auth/token.service')
const { AuthSessionService } = require('../dist/modules/auth/auth-session.service')
const { CaptchaService } = require('../dist/modules/auth/captcha.service')
const { mapStatus, sortTree } = require('../dist/cli/migrate-legacy-platform')
const { HealthService } = require('../dist/modules/health/health.service')
const { selectEffectiveScopeRules } = require('../dist/modules/permissions/permissions.policy')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

function fakeRedis() {
    const values = new Map()
    const ttls = new Map()
    return {
        values,
        ttls,
        async get(key) {
            return values.get(key) ?? null
        },
        async getDel(key) {
            const value = values.get(key) ?? null
            values.delete(key)
            return value
        },
        async setEx(key, seconds, value) {
            assert.ok(seconds > 0)
            values.set(key, value)
            ttls.set(key, seconds)
        },
        async del(key) {
            values.delete(key)
        },
        async rotate(oldKey, newKey, seconds, value) {
            assert.ok(seconds > 0)
            values.set(newKey, value)
            values.delete(oldKey)
        }
    }
}

test('组织和菜单树按 sort 排序并保留层级', () => {
    const nodes = [
        { keyId: 3, parentKeyId: 1, sort: 20 },
        { keyId: 1, parentKeyId: undefined, sort: 10 },
        { keyId: 2, parentKeyId: 1, sort: 10 }
    ]
    assertValidTree(nodes, '测试树')
    const tree = buildTree(nodes)
    assert.deepEqual(
        tree.map(node => node.keyId),
        [1]
    )
    assert.deepEqual(
        tree[0].children.map(node => node.keyId),
        [2, 3]
    )
})

test('树校验拒绝循环和缺失父节点', () => {
    assert.throws(() => assertValidTree([{ keyId: 1, parentKeyId: 2, sort: 0 }], '测试树'), /父节点/)
    assert.throws(
        () =>
            assertValidTree(
                [
                    { keyId: 1, parentKeyId: 2, sort: 0 },
                    { keyId: 2, parentKeyId: 1, sort: 0 }
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

test('Redis 登录会话支持创建、轮换和撤销', async () => {
    const redis = fakeRedis()
    const service = new AuthSessionService(redis, config({ AUTH_SESSION_PREFIX: 'test:session' }))
    const now = Math.floor(Date.now() / 1000)
    const first = { sub: '2149446185344106496', jti: 'first', exp: now + 600 }
    const second = { sub: first.sub, jti: 'second', exp: now + 600 }

    await service.create(first)
    await service.assertActive(first)
    await service.rotate(first.jti, second)
    await assert.rejects(() => service.assertActive(first), /会话已失效/)
    await service.assertActive(second)
    await service.revoke(second.jti)
    await assert.rejects(() => service.assertActive(second), /会话已失效/)
})

test('图形验证码忽略大小写且只能使用一次', async () => {
    const redis = fakeRedis()
    const service = new CaptchaService(redis)
    const captcha = await service.create()
    const [key, expected] = [...redis.values.entries()][0]

    assert.match(key, /^chat-web:account:captcha:/)
    assert.equal(redis.ttls.get(key), service.expiresIn)
    assert.equal(service.expiresIn, 180)
    assert.equal(captcha.sid, key.slice(key.lastIndexOf(':') + 1))
    assert.match(captcha.svg, /^<svg/)
    await service.verify(captcha.sid, expected.toLowerCase())
    await assert.rejects(() => service.verify(captcha.sid, expected), /验证码错误或已过期/)
})

test('旧平台迁移映射状态并按父子依赖排序', () => {
    assert.equal(mapStatus('enable'), 'enabled')
    assert.equal(mapStatus('disable'), 'disabled')
    assert.deepEqual(
        sortTree(
            [
                { key_id: 'child', pid: 'root' },
                { key_id: 'root', pid: null }
            ],
            '测试树'
        ).map(item => item.key_id),
        ['root', 'child']
    )
    assert.throws(() => sortTree([{ key_id: 'child', pid: 'missing' }], '测试树'), /循环或缺失父节点/)
})

test('资源专属数据范围覆盖同角色的默认规则，不影响其他角色并集', () => {
    const roles = [{ keyId: 1 }, { keyId: 2 }]
    const rules = [
        { id: 'a-default', roleKeyId: 1, resourceCode: '*' },
        { id: 'a-user', roleKeyId: 1, resourceCode: 'account:user' },
        { id: 'b-default', roleKeyId: 2, resourceCode: '*' }
    ]
    assert.deepEqual(
        selectEffectiveScopeRules(roles, rules, 'account:user').map(rule => rule.id),
        ['a-user', 'b-default']
    )
})

test('就绪检查会报告缺失的数据库表', async () => {
    const service = new HealthService(
        {
            isInitialized: true,
            entityMetadatas: [{ tableName: 'table_a' }, { tableName: 'table_b' }],
            async query() {
                return [{ tableName: 'table_a' }]
            }
        },
        config({ JWT_SECRET: '0123456789abcdef0123456789abcdef' }),
        { async ping() { return true } }
    )
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['table_b'])
})

test('就绪检查会拒绝缺失或过短的 JWT 密钥', async () => {
    const dataSource = {
        isInitialized: true,
        entityMetadatas: [{ tableName: 'table_a' }],
        async query() {
            return [{ tableName: 'table_a' }]
        }
    }
    const redis = { async ping() { return true } }
    const missing = await new HealthService(dataSource, config({}), redis).getReadiness()
    const valid = await new HealthService(dataSource, config({ JWT_SECRET: '0123456789abcdef0123456789abcdef' }), redis).getReadiness()
    assert.equal(missing.status, 'DOWN')
    assert.equal(missing.security.jwtConfigured, false)
    assert.equal(valid.status, 'UP')
    assert.equal(valid.security.jwtConfigured, true)
})

test('就绪检查会拒绝不可用的 Redis 会话存储', async () => {
    const dataSource = {
        isInitialized: true,
        entityMetadatas: [{ tableName: 'table_a' }],
        async query() {
            return [{ tableName: 'table_a' }]
        }
    }
    const result = await new HealthService(
        dataSource,
        config({ JWT_SECRET: '0123456789abcdef0123456789abcdef' }),
        { async ping() { return false } }
    ).getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.equal(result.redis.connected, false)
})
