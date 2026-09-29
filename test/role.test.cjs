const test = require('node:test')
const assert = require('node:assert/strict')

const {
    TbAccountRole,
    TbAccountRoleDataScopeStatusDefinition,
    TbAccountRoleDataScopeTypeDefinition,
    TbAccountRoleStatusDefinition
} = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')
const { RoleService } = require('../dist/modules/role/role.service')

function selectEffectiveScopeRules(roles, scopes, resourceCode, defaultResourceCode = '*') {
    return roles.flatMap(role => {
        const roleScopes = scopes.filter(scope => scope.roleKeyId === role.keyId)
        const exact = roleScopes.find(scope => scope.resourceCode === resourceCode)
        return exact ? [exact] : roleScopes.filter(scope => scope.resourceCode === defaultResourceCode)
    })
}

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
        async findDataScopesRequired(principal, dataScopes) {
            calls.push(['findDataScopesRequired', dataScopes])
        },
        async findDataScopeOrganizationsRequired(manager, dataScopes) {
            assert.equal(manager, transactionManager)
            calls.push(['findDataScopeOrganizationsRequired', dataScopes])
        },
        async replaceRoleDataScopes(manager, roleKeyId, dataScopes) {
            assert.equal(manager, transactionManager)
            calls.push(['replaceRoleDataScopes', roleKeyId, dataScopes])
        },
        async findCodeAvailable(manager, code) {
            assert.equal(manager, transactionManager)
            calls.push(['findCodeAvailable', code])
        }
    }
    const service = new RoleService(repository, roleUtilsService, { invalidate: async () => undefined })

    const result = await service.httpBaseAccountCreateRole(
        { uid: '2281665656346656771' },
        { name: '审计员', code: 'auditor', sort: 10, status: 'enabled', dataScopes: [] }
    )

    assert.equal(result.keyId, 101)
    assert.equal(result.builtin, false)
    assert.deepEqual(
        calls.map(call => call[0]),
        [
            'findDataScopesRequired',
            'transaction',
            'findCodeAvailable',
            'findDataScopeOrganizationsRequired',
            'create',
            'save',
            'replaceRoleDataScopes'
        ]
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
        async findDataScopesRequired(principal, dataScopes) {
            calls.push(['findDataScopesRequired', dataScopes])
        },
        async findDataScopeOrganizationsRequired(manager, dataScopes) {
            assert.equal(manager, transactionManager)
            calls.push(['findDataScopeOrganizationsRequired', dataScopes])
        },
        async replaceRoleDataScopes(manager, roleKeyId, dataScopes) {
            assert.equal(manager, transactionManager)
            calls.push(['replaceRoleDataScopes', roleKeyId, dataScopes])
        },
        async findRequired(keyId, manager) {
            calls.push(['findRequired', keyId, manager])
            return { keyId, name: '旧角色', code: 'old_code', builtin: false, status: 'enabled' }
        },
        async findCodeAvailable(manager, code, excludedKeyId) {
            assert.equal(manager, transactionManager)
            calls.push(['findCodeAvailable', code, excludedKeyId])
        }
    }
    const service = new RoleService(repository, roleUtilsService, { invalidate: async () => undefined })

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
        async findDataScopesRequired() {
            calls.push('findDataScopesRequired')
        },
        async findRequired() {
            return { keyId: 103, code: 'builtin_role', builtin: true, status: 'enabled' }
        },
        async findSuperAdminRequired() {
            calls.push('findSuperAdminRequired')
        }
    }
    const service = new RoleService(repository, roleUtilsService, { invalidate: async () => undefined })

    await assert.rejects(
        () => service.httpBaseAccountUpdateRole({ uid: 'ordinary-user' }, { keyId: 103, code: 'changed_role' }),
        error => error.message === '系统内置角色不能修改编码'
    )
    assert.deepEqual(calls, ['findDataScopesRequired'])
})

test('资源专属数据范围覆盖同角色的默认规则，不影响其他角色并集', () => {
    const roles = [{ keyId: 1 }, { keyId: 2 }]
    const rules = [
        { id: 'a-default', roleKeyId: 1, resourceCode: '*' },
        { id: 'a-user', roleKeyId: 1, resourceCode: 'chat:account:user' },
        { id: 'b-default', roleKeyId: 2, resourceCode: '*' }
    ]
    assert.deepEqual(
        selectEffectiveScopeRules(roles, rules, 'chat:account:user').map(rule => rule.id),
        ['a-user', 'b-default']
    )
})

test('角色枚举接口直接返回 schema 定义的选项', async () => {
    const service = new RoleService({}, {}, {})
    const result = await service.httpBaseAccountRoleEnums()

    assert.deepEqual(result, {
        statusOptions: TbAccountRoleStatusDefinition.options,
        scopeTypeOptions: TbAccountRoleDataScopeTypeDefinition.options,
        scopeStatusOptions: TbAccountRoleDataScopeStatusDefinition.options
    })
})

test('批量更新角色排序在一个事务内完成，并拒绝重复或不存在的角色', async () => {
    const updates = []
    const transactionManager = {
        async count() {
            return 2
        },
        async update(entity, where, values) {
            updates.push({ where, values })
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                return callback(transactionManager)
            }
        }
    }
    const service = new RoleService(repository, {}, { invalidate: async () => undefined })

    const list = [
        { keyId: 2, sort: 10 },
        { keyId: 1, sort: 20 }
    ]
    assert.deepEqual(await service.httpBaseAccountUpdateRoleSort({ list }), { success: true })
    assert.deepEqual(updates, [
        { where: { keyId: 2 }, values: { sort: 10 } },
        { where: { keyId: 1 }, values: { sort: 20 } }
    ])
    await assert.rejects(() => service.httpBaseAccountUpdateRoleSort({ list: [list[0], list[0]] }), /角色主键不能重复/)
    await assert.rejects(() => service.httpBaseAccountUpdateRoleSort({ list: [...list, { keyId: 3, sort: 30 }] }), /角色不存在/)
})
