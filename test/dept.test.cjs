const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTree, assertValidTree } = require('@wlisfes/chat-web-base-schema/utils')
const { DeptService } = require('../dist/modules/dept/dept.service')
const { DeptUtilsService } = require('../dist/modules/dept/dept.utils.service')
const {
    TbAccountOrganization,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUserOrganization,
    TbAccountUserRole
} = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')

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
