const test = require('node:test')
const assert = require('node:assert/strict')
const { generateUid } = require('@wlisfes/chat-web-base-schema/utils')
const { PasswordService } = require('@wlisfes/chat-web-base-schema/auth')
const { UserService } = require('../dist/modules/user/user.service')
const {
    TbAccountUserEmploymentStatusDefinition,
    TbAccountUserOrganizationStatusDefinition,
    TbAccountUserStatusDefinition
} = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')

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

    assert.deepEqual(await service.httpBaseAccountColumnUserResolver({ uids: [] }), [])
    assert.deepEqual(await service.httpBaseAccountColumnUserResolver({ uids: ['1', '1', '2'] }), [{ uid: '1', number: 'A1', name: '张三' }])
    assert.deepEqual(received.fields, ['t.uid', 't.number', 't.name', 't.avatar'])
    assert.deepEqual(received.parameters, { uids: ['1', '2'] })

    await service.httpBaseAccountColumnUserResolver({ uids: ['1'], fields: ['name', 'phone', 'name'] })
    assert.deepEqual(received.fields, ['t.uid', 't.name', 't.phone'])
})

test('批量账号摘要请求 organizations 时关联返回所属组织且不作为数据库列查询', async () => {
    let selected = []
    const database = {
        async builder(repository, handler) {
            return handler({
                select(fields) {
                    selected = fields
                    return this
                },
                where() {
                    return this
                },
                async getMany() {
                    return [
                        { uid: '1', name: '张三' },
                        { uid: '2', name: '李四' }
                    ]
                }
            })
        }
    }
    const userUtilsService = {
        async findUserOrganizationSummaries(uids) {
            assert.deepEqual(uids, ['1', '2'])
            return new Map([['1', [{ keyId: 10, name: '研发中心', code: 'RD', isPrimary: true, postName: '前端开发工程师' }]]])
        }
    }
    const service = new UserService({}, database, {}, userUtilsService, {})
    const users = await service.httpBaseAccountColumnUserResolver({ uids: ['1', '2'], fields: ['name', 'organizations'] })
    assert.deepEqual(selected, ['t.uid', 't.name'])
    assert.deepEqual(users, [
        {
            uid: '1',
            name: '张三',
            organizations: [{ keyId: 10, name: '研发中心', code: 'RD', isPrimary: true, postName: '前端开发工程师' }]
        },
        { uid: '2', name: '李四', organizations: [] }
    ])
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

test('账号枚举接口直接返回 schema 定义的选项', async () => {
    const service = new UserService({}, {}, {}, {}, {})
    const result = await service.httpBaseAccountUserEnums()

    assert.deepEqual(result, {
        statusOptions: TbAccountUserStatusDefinition.options,
        employmentStatusOptions: TbAccountUserEmploymentStatusDefinition.options,
        membershipStatusOptions: TbAccountUserOrganizationStatusDefinition.options
    })
})
