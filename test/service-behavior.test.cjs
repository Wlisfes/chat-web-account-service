const test = require('node:test')
const assert = require('node:assert/strict')

const { TbAccountRole } = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')
const { RoleService } = require('../dist/modules/role/role.service')

test('角色新增在同一事务内完成编码校验与写入', async () => {
    const calls = []
    const transactionManager = {
        create(entity, fields) {
            assert.equal(entity, TbAccountRole)
            calls.push(['create', fields])
            return { keyId: 101, ...fields }
        },
        async save(role) {
            calls.push(['save', role])
            return role
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                calls.push(['transaction'])
                return callback(transactionManager)
            }
        }
    }
    const roleUtilsService = {
        async findCodeAvailable(manager, code) {
            assert.equal(manager, transactionManager)
            calls.push(['findCodeAvailable', code])
        }
    }
    const service = new RoleService(repository, roleUtilsService)

    const result = await service.httpBaseAccountCreateRole({ name: '审计员', code: 'auditor', sort: 10, status: 'enabled' })

    assert.equal(result.keyId, 101)
    assert.equal(result.builtin, false)
    assert.deepEqual(
        calls.map(call => call[0]),
        ['transaction', 'findCodeAvailable', 'create', 'save']
    )
})
test('角色编辑在事务内重新锁定角色并完成编码校验与写入', async () => {
    const calls = []
    const transactionManager = {
        merge(entity, role, fields) {
            assert.equal(entity, TbAccountRole)
            calls.push(['merge', fields])
            Object.assign(role, fields)
        },
        async save(role) {
            calls.push(['save', role])
            return role
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                calls.push(['transaction'])
                return callback(transactionManager)
            }
        }
    }
    const roleUtilsService = {
        async findRequired(keyId, manager) {
            calls.push(['findRequired', keyId, manager])
            return { keyId, name: '旧角色', code: 'old_code', builtin: false, status: 'enabled' }
        },
        async findCodeAvailable(manager, code, excludedKeyId) {
            assert.equal(manager, transactionManager)
            calls.push(['findCodeAvailable', code, excludedKeyId])
        }
    }
    const service = new RoleService(repository, roleUtilsService)

    const result = await service.httpBaseAccountUpdateRole({ uid: '2281665656346656771' }, { keyId: 102, name: '新角色', code: 'new_code' })

    assert.equal(result.name, '新角色')
    assert.equal(result.code, 'new_code')
    assert.equal(calls.filter(call => call[0] === 'findRequired').length, 1)
    assert.equal(calls.find(call => call[0] === 'findRequired' && call[2] === transactionManager)?.[1], 102)
    assert.deepEqual(calls.find(call => call[0] === 'findCodeAvailable')?.slice(1), ['new_code', 102])
    assert.ok(calls.some(call => call[0] === 'transaction'))
    assert.ok(calls.some(call => call[0] === 'save'))
})
test('编辑内置角色时优先返回禁止修改编码错误', async () => {
    const calls = []
    const transactionManager = {}
    const repository = {
        manager: {
            async transaction(callback) {
                return callback(transactionManager)
            }
        }
    }
    const roleUtilsService = {
        async findRequired() {
            return { keyId: 103, code: 'builtin_role', builtin: true, status: 'enabled' }
        },
        async findSuperAdminRequired() {
            calls.push('findSuperAdminRequired')
        }
    }
    const service = new RoleService(repository, roleUtilsService)

    await assert.rejects(
        () => service.httpBaseAccountUpdateRole({ uid: 'ordinary-user' }, { keyId: 103, code: 'changed_role' }),
        error => error.message === '系统内置角色不能修改编码'
    )
    assert.deepEqual(calls, [])
})
