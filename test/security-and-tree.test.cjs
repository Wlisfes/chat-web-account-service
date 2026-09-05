const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException } = require('@nestjs/common')
const { plainToInstance } = require('class-transformer')
const { validate } = require('class-validator')

const { buildTree, assertValidTree, generateUid } = require('@wlisfes/chat-web-base-schema/utils')
const { PasswordService } = require('@wlisfes/chat-web-base-schema/auth')
const { NacosService } = require('@wlisfes/chat-web-base-schema/nacos')
const { FeignController } = require('../dist/modules/feign/feign.controller')
const { FeignService } = require('../dist/modules/feign/feign.service')
const { UserService } = require('../dist/modules/user/user.service')
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

test('业务 Feign 不再暴露内省接口，且只接受服务间凭据', async () => {
    const consumer = { keyId: 12, uid: '2149446185344106496', name: '示例客户' }
    const controller = new FeignController(
        new FeignService(
            {
                async httpBaseAccountResolverConsumer(query) {
                    assert.deepEqual(query, { keyId: 12 })
                    return consumer
                }
            },
            {}
        ),
        config({ 'feign.service_token': 'service-token' })
    )

    assert.equal(FeignController.prototype.introspect, undefined)
    assert.equal(await controller.resolveConsumer('Bearer service-token', 12), consumer)
    await assert.rejects(
        () => controller.resolveConsumer('Bearer user-token', 12),
        error => error?.status === 401
    )
})

test('批量账号摘要只返回展示字段并对重复 UID 去重', async () => {
    let received = {}
    const database = {
        async builder(repository, handler) {
            return handler({
                select(fields) {
                    received.fields = fields
                    return this
                },
                where(_condition, parameters) {
                    received.parameters = parameters
                    return this
                },
                async getMany() {
                    return [{ uid: '1', number: 'A1', name: '张三' }]
                }
            })
        }
    }
    const service = new UserService({}, database, {}, {})

    assert.deepEqual(await service.httpBaseAccountBatchResolverUser({ uids: [] }), [])
    assert.deepEqual(await service.httpBaseAccountBatchResolverUser({ uids: ['1', '1', '2'] }), [{ uid: '1', number: 'A1', name: '张三' }])
    assert.deepEqual(received.fields, ['t.uid', 't.number', 't.name', 't.avatar'])
    assert.deepEqual(received.parameters, { uids: ['1', '2'] })
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
        config({ 'feign.service_token': 'service-token' })
    )
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['table_b'])
})

test('就绪检查会拒绝缺失的 Feign 服务凭据', async () => {
    const dataSource = {
        isInitialized: true,
        entityMetadatas: [{ tableName: 'table_a' }],
        async query() {
            return [{ tableName: 'table_a' }]
        }
    }
    const missing = await new HealthService(dataSource, config({})).getReadiness()
    const valid = await new HealthService(dataSource, config({ 'feign.service_token': 'service-token' })).getReadiness()

    assert.equal(missing.status, 'DOWN')
    assert.equal(missing.security.authConfigured, false)
    assert.equal(valid.status, 'UP')
    assert.equal(valid.security.authConfigured, true)
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
