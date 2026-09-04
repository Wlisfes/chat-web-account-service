const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')

const { buildTree, assertValidTree, generateUid } = require('@wlisfes/chat-web-base-schema/utils')
const { PasswordService } = require('../dist/modules/auth/password.service')
const { LoginDto } = require('../dist/modules/auth/dto/login.dto')
const { AuthService } = require('../dist/modules/auth/auth.service')
const { AuthSessionService, TokenService } = require('@wlisfes/chat-web-base-schema/auth')
const { NacosService } = require('@wlisfes/chat-web-base-schema/nacos')
const { RedisService } = require('@wlisfes/chat-web-base-schema/redis')
const { CaptchaService } = require('../dist/modules/auth/captcha.service')
const { AuthController } = require('../dist/modules/auth/auth.controller')
const { mapStatus, sortTree } = require('../dist/cli/migrate-legacy-platform')
const { FINANCE_MENU_SEEDS } = require('../dist/cli/finance-menu.seed')
const { CRM_MENU_SEEDS } = require('../dist/cli/crm-menu.seed')
const { grantsAreIsolated } = require('../dist/cli/isolate-service-databases')
const { HealthService } = require('../dist/modules/health/health.service')
const { DeptService } = require('../dist/modules/dept/dept.service')
const { DeptUtilsService } = require('../dist/modules/dept/dept.utils.service')
const { selectEffectiveScopeRules } = require('../dist/modules/permission/permission.policy')
const { HttpExceptionFilter, PreserveHttpStatus } = require('@wlisfes/chat-web-base-schema/filters')
const {
    TbAccountOrganization,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUserOrganization,
    TbAccountUserRole
} = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')

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

test('账号鉴权内省使用同一认证器校验 Bearer Token', async () => {
    const principal = { uid: '2149446185344106496', sessionId: 'session-id' }
    const controller = new AuthController({
        async httpBaseAccountIntrospectToken(token) {
            assert.equal(token, 'account-token')
            return principal
        }
    })
    const request = { header: name => (name === 'authorization' ? 'Bearer account-token' : undefined) }
    assert.equal(await controller.httpBaseAccountIntrospectToken(request), principal)
    await assert.rejects(() => controller.httpBaseAccountIntrospectToken({ header: () => undefined }), /缺少 Bearer/)
})

test('部署迁移只接受本服务数据库授权', () => {
    assert.equal(
        grantsAreIsolated(
            [
                'GRANT USAGE ON *.* TO `chat_web_account_service`@`%`',
                'GRANT ALL PRIVILEGES ON `chat_web_account`.* TO `chat_web_account_service`@`%`'
            ],
            'chat_web_account'
        ),
        true
    )
    assert.equal(grantsAreIsolated(['GRANT ALL PRIVILEGES ON *.* TO `root`@`%`'], 'chat_web_account'), false)
    assert.equal(grantsAreIsolated(['GRANT SELECT ON `chat_web_finance`.* TO `service`@`%`'], 'chat_web_account'), false)
    assert.equal(
        grantsAreIsolated(['GRANT ALL PRIVILEGES ON `chat-web-account`.* TO `chat_web_account_service`@`%`'], 'chat-web-account'),
        true
    )
})

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

function fakeDeptManager({ hasMember = false } = {}) {
    const deletes = []
    const candidateScopes = [
        { keyId: 153, roleKeyId: 154 },
        { keyId: 201, roleKeyId: 200 }
    ]
    const manager = {
        deletes,
        async transaction(callback) {
            return callback(manager)
        },
        getRepository(entity) {
            assert.equal(entity, TbAccountOrganization)
            return {
                createQueryBuilder() {
                    return {
                        setLock() {
                            return this
                        },
                        async getMany() {
                            return []
                        }
                    }
                }
            }
        },
        async findOneBy(entity, where) {
            assert.equal(entity, TbAccountOrganization)
            return { keyId: where.keyId, name: 'HRBP组' }
        },
        async existsBy(entity) {
            if (entity === TbAccountUserOrganization) return hasMember
            return false
        },
        async find(entity, options) {
            if (entity === TbAccountOrganization) return []
            if (entity === TbAccountRoleDataScopeOrganization) {
                if (Object.hasOwn(options.where, 'organizationKeyId')) {
                    return [
                        { dataScopeKeyId: 153, organizationKeyId: 156 },
                        { dataScopeKeyId: 201, organizationKeyId: 156 }
                    ]
                }
                return [
                    { dataScopeKeyId: 153, organizationKeyId: 156 },
                    { dataScopeKeyId: 201, organizationKeyId: 156 },
                    { dataScopeKeyId: 201, organizationKeyId: 157 }
                ]
            }
            if (entity === TbAccountRoleDataScope) return candidateScopes
            if (entity === TbAccountRole) return [{ keyId: 154 }, { keyId: 200 }]
            throw new Error(`未处理的查询实体：${entity.name}`)
        },
        async delete(entity, criteria) {
            deletes.push({ entity, criteria })
        },
        createQueryBuilder() {
            return {
                delete() {
                    return this
                },
                from() {
                    return this
                },
                async execute() {}
            }
        }
    }
    return manager
}

function createDeptService(manager) {
    const repository = { manager }
    const database = {
        builder(currentRepository, callback) {
            return callback(currentRepository.createQueryBuilder('t'))
        }
    }
    return new DeptService(repository, new DeptUtilsService(repository, database))
}

test('空部门删除时级联删除专属岗位角色并移除其他角色中的部门授权', async () => {
    const manager = fakeDeptManager()
    const service = createDeptService(manager)

    await service.httpBaseAccountDeleteDept({ keyId: 156 })

    const roleDelete = manager.deletes.find(item => item.entity === TbAccountRole)
    assert.deepEqual(roleDelete.criteria.keyId.value, [154])
    assert.ok(manager.deletes.some(item => item.entity === TbAccountUserRole))
    assert.ok(manager.deletes.some(item => item.entity === TbAccountRoleMenu))
    assert.ok(manager.deletes.some(item => item.entity === TbAccountRoleDataScope))
    assert.equal(manager.deletes.filter(item => item.entity === TbAccountRoleDataScopeOrganization).length, 2)
    assert.ok(manager.deletes.some(item => item.entity === TbAccountOrganization && item.criteria.keyId === 156))
})

test('部门仍有员工时禁止删除且不清理岗位角色', async () => {
    const manager = fakeDeptManager({ hasMember: true })
    const service = createDeptService(manager)

    await assert.rejects(() => service.httpBaseAccountDeleteDept({ keyId: 156 }), /组织仍有关联成员/)
    assert.equal(manager.deletes.length, 0)
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

test('密码校验兼容旧管理端的 Base64 + encodeURIComponent 编码', async () => {
    const service = new PasswordService()
    const encoded = await service.hash('123456')
    const legacyPassword = Buffer.from(encodeURIComponent('123456'), 'utf8').toString('base64')

    assert.equal(await service.verify(legacyPassword, encoded), true)
    assert.equal(await service.verify('123456', encoded), true)
    assert.equal(await service.verify('MTIzNDU2=', encoded), false)
})

test('登录 DTO 兼容旧版 number 工号字段并保留 account 字段', async () => {
    const numberInput = plainToInstance(LoginDto, { number: '1001', password: '123456', code: 'ABCD' })
    const accountInput = plainToInstance(LoginDto, { account: '1001', password: '123456', code: 'ABCD' })
    const accountWithEmptyLegacyNumber = plainToInstance(LoginDto, { account: '1001', number: '', password: '123456', code: 'ABCD' })
    const invalidAccountWithNumber = plainToInstance(LoginDto, { account: 1001, number: '1001', password: '123456', code: 'ABCD' })
    const missingIdentifier = plainToInstance(LoginDto, { password: '123456', code: 'ABCD' })

    assert.equal(numberInput.number, '1001')
    assert.equal(accountInput.account, '1001')
    assert.equal((await validate(numberInput)).length, 0)
    assert.equal((await validate(accountInput)).length, 0)
    assert.equal((await validate(accountWithEmptyLegacyNumber)).length, 0)
    assert.ok((await validate(invalidAccountWithNumber)).some(error => error.property === 'account'))
    assert.ok((await validate(missingIdentifier)).some(error => error.property === 'account'))
})

test('登录服务可使用工号和旧版编码密码完成认证', async () => {
    const passwordService = new PasswordService()
    const storedPassword = await passwordService.hash('123456')
    const legacyPassword = Buffer.from(encodeURIComponent('123456'), 'utf8').toString('base64')
    const calls = []
    const user = {
        uid: '2149446185344106496',
        number: '1001',
        name: '测试账号',
        avatar: null,
        password: storedPassword
    }
    const service = new AuthService(
        {
            async update(criteria, fields) {
                calls.push({ criteria, fields })
            }
        },
        passwordService,
        {
            issueAccessToken(uid) {
                return {
                    accessToken: 'access-token',
                    tokenType: 'Bearer',
                    expiresIn: 36000,
                    claims: { sub: uid, jti: 'session-id', exp: 9999999999 }
                }
            }
        },
        { async create() {} },
        { async verify() {} },
        {
            async findUserByAccountRequired(identifier) {
                calls.push(identifier)
                return user
            },
            assertActiveUser() {}
        }
    )

    const result = await service.httpBaseAccountLoginToken({ number: '1001', password: legacyPassword, code: 'ABCD' })
    assert.equal(calls[0], '1001')
    assert.equal(result.accessToken, 'access-token')
    assert.equal(result.user.number, '1001')
})

test('JWT 可验证且拒绝篡改和不同密钥', () => {
    const values = {
        'security.jwt.secret': '0123456789abcdef0123456789abcdef',
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

    const otherService = new TokenService(config({ ...values, 'security.jwt.secret': 'abcdef0123456789abcdef0123456789' }))
    assert.throws(() => otherService.verifyAccessToken(token.accessToken), /签名/)
})

test('Redis 登录会话支持创建、轮换和撤销', async () => {
    const redis = fakeRedis()
    const service = new AuthSessionService(redis, config({ 'security.session.prefix': 'test:session' }))
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

test('Nacos Redis 配置会生成带认证信息的连接地址', () => {
    const service = new RedisService(
        config({
            redis: {
                host: 'chat-web-redis',
                port: 6379,
                database: 2,
                username: 'default',
                password: 'p@ss/word'
            }
        })
    )
    const resolved = new URL(service.getConnectionUrl())
    assert.equal(resolved.hostname, 'chat-web-redis')
    assert.equal(resolved.pathname, '/2')
    assert.equal(resolved.username, 'default')
    assert.equal(resolved.password, 'p%40ss%2Fword')
})

test('Nacos 远端配置会写入 ConfigService', () => {
    const values = new Map()
    const configService = {
        set(key, value) {
            values.set(key, value)
        }
    }

    const service = new NacosService(configService, {
        serverAddr: 'nacos.internal:8848',
        namespace: 'test',
        serviceName: 'chat-web-account-service',
        registerPort: 5010
    })
    service.applyRemoteConfig(
        'REDIS_HOST: remote-redis\nREDIS_URL: redis://remote-redis:6379/0\nremoteOnly: enabled',
        '已加载',
        'test.yaml',
        'DEFAULT_GROUP',
        'test'
    )
    assert.equal(values.get('REDIS_HOST'), 'remote-redis')
    assert.equal(values.get('REDIS_URL'), 'redis://remote-redis:6379/0')
    assert.equal(values.get('remoteOnly'), 'enabled')
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

test('财务菜单种子覆盖现有前端路由并按父级在前排序', () => {
    const paths = FINANCE_MENU_SEEDS.map(item => item.path)
    assert.equal(new Set(paths).size, paths.length)
    assert.deepEqual(
        paths.filter(path => path.split('/').length === 4),
        [
            '/finance/deploy/brand',
            '/finance/deploy/currency',
            '/finance/deploy/exchange',
            '/finance/deploy/country',
            '/finance/account/consumer',
            '/finance/rates/sms'
        ]
    )
    for (const item of FINANCE_MENU_SEEDS) {
        if (item.parentPath) assert.ok(paths.indexOf(item.parentPath) < paths.indexOf(item.path))
    }
})

test('CRM 菜单种子只使用 consumer 和 sms quote 规范路由', () => {
    const paths = CRM_MENU_SEEDS.map(item => item.path)
    assert.equal(new Set(paths).size, paths.length)
    assert.deepEqual(paths, ['/crm', '/crm/consumer', '/crm/partner', '/crm/sms', '/crm/sms/quote/create', '/crm/sms/quote'])
    assert.doesNotMatch(paths.join('\n'), /client|formosan|saturation|:[A-Za-z]/)
    for (const item of CRM_MENU_SEEDS) {
        if (item.parentPath) assert.ok(paths.indexOf(item.parentPath) < paths.indexOf(item.path))
    }
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
        {
            async ping() {
                return true
            }
        }
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
    const redis = {
        async ping() {
            return true
        }
    }
    const missing = await new HealthService(dataSource, config({}), redis).getReadiness()
    const valid = await new HealthService(
        dataSource,
        config({ 'security.jwt.secret': '0123456789abcdef0123456789abcdef' }),
        redis
    ).getReadiness()
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
    const result = await new HealthService(dataSource, config({ 'security.jwt.secret': '0123456789abcdef0123456789abcdef' }), {
        async ping() {
            return false
        }
    }).getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.equal(result.redis.connected, false)
})

test('HTTP 业务异常使用传输状态 200 和响应体业务 code', () => {
    const response = {
        statusCode: undefined,
        body: undefined,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value
        },
        status(code) {
            this.statusCode = code
            return this
        },
        json(body) {
            this.body = body
        }
    }
    const host = {
        switchToHttp() {
            return {
                getRequest() {
                    return { originalUrl: '/auth/token/login' }
                },
                getResponse() {
                    return response
                }
            }
        }
    }

    new HttpExceptionFilter().catch(new BadRequestException(['验证码错误']), host)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), ['data', 'code', 'message', 'logId', 'timestamp'])
    assert.equal(response.body.code, 400)
    assert.equal(response.body.message, '验证码错误')
    assert.equal(response.headers['x-request-id'], response.body.logId)
    assert.match(response.body.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})

test('健康检查异常保留原生 HTTP 状态', () => {
    const response = {
        statusCode: undefined,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value
        },
        status(code) {
            this.statusCode = code
            return this
        },
        json() {}
    }
    const healthHandler = () => undefined
    PreserveHttpStatus()(healthHandler)
    const host = {
        getHandler() {
            return healthHandler
        },
        getClass() {
            return class HealthController {}
        },
        switchToHttp() {
            return {
                getRequest() {
                    return { originalUrl: '/health/ready' }
                },
                getResponse() {
                    return response
                }
            }
        }
    }

    new HttpExceptionFilter().catch(new BadRequestException('健康检查失败'), host)
    assert.equal(response.statusCode, 400)
})
