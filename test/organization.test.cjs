const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTree, assertValidTree } = require('@wlisfes/chat-web-base-schema/utils')
const { OrganizationService } = require('../dist/modules/organization/organization.service')
const { OrganizationUtilsService } = require('../dist/modules/organization/organization.utils.service')
const {
    TbAccountOrganization,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUser,
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

function fakeOrganizationManager({ hasMember = false } = {}) {
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

function createOrganizationService(manager) {
    const repository = { manager }
    const database = {
        builder(currentRepository, callback) {
            return callback(currentRepository.createQueryBuilder('t'))
        }
    }
    return new OrganizationService(repository, new OrganizationUtilsService(repository, database))
}

test('空部门删除时级联删除专属岗位角色并移除其他角色中的部门授权', async () => {
    const manager = fakeOrganizationManager()
    const service = createOrganizationService(manager)

    await service.httpBaseAccountDeleteOrganization({ keyId: 156 })

    const roleDelete = manager.deletes.find(item => item.entity === TbAccountRole)
    assert.deepEqual(roleDelete.criteria.keyId.value, [154])
    assert.ok(manager.deletes.some(item => item.entity === TbAccountUserRole))
    assert.ok(manager.deletes.some(item => item.entity === TbAccountRoleMenu))
    assert.ok(manager.deletes.some(item => item.entity === TbAccountRoleDataScope))
    assert.equal(manager.deletes.filter(item => item.entity === TbAccountRoleDataScopeOrganization).length, 2)
    assert.ok(manager.deletes.some(item => item.entity === TbAccountOrganization && item.criteria.keyId === 156))
})

test('部门仍有员工时禁止删除且不清理岗位角色', async () => {
    const manager = fakeOrganizationManager({ hasMember: true })
    const service = createOrganizationService(manager)

    await assert.rejects(() => service.httpBaseAccountDeleteOrganization({ keyId: 156 }), /组织仍有关联成员/)
    assert.equal(manager.deletes.length, 0)
})

function createOrganizationUserUtils(organizations, memberships, users) {
    const transactionManager = {
        async find(entity, options) {
            if (entity === TbAccountUserOrganization) {
                assert.equal(options.where.status, 'enabled')
                return memberships
            }
            if (entity === TbAccountUser) return users
            throw new Error(`未处理的查询实体：${entity.name}`)
        },
        getRepository(entity) {
            assert.equal(entity, TbAccountOrganization)
            return {
                createQueryBuilder() {
                    return {
                        orderBy() {
                            return this
                        },
                        addOrderBy() {
                            return this
                        },
                        async getMany() {
                            return organizations
                        }
                    }
                }
            }
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                return callback(transactionManager)
            }
        }
    }
    const database = {
        builder(currentRepository, callback) {
            return callback(currentRepository.createQueryBuilder('t'))
        }
    }
    return new OrganizationUtilsService(repository, database)
}

test('带启用成员的组织树把员工挂到所属部门下', async () => {
    const organizations = [
        {
            keyId: 1,
            parentKeyId: undefined,
            sort: 10,
            name: '总部',
            leaderUserUid: '10001',
            code: 'HQ',
            status: 'enabled',
            createTime: '2026-01-01 00:00:00',
            modifyTime: '2026-01-02 00:00:00'
        },
        { keyId: 2, parentKeyId: 1, sort: 10, name: '研发部', leaderUserUid: undefined }
    ]
    const memberships = [
        { userUid: '10001', organizationKeyId: 1, isPrimary: true, positionName: '总经理', status: 'enabled' },
        { userUid: '10002', organizationKeyId: 2, isPrimary: true, positionName: '工程师', status: 'enabled' }
    ]
    const users = [
        { uid: '10001', number: 'A1', name: '张三', avatar: 'a.png' },
        { uid: '10002', number: 'A2', name: '李四', avatar: 'b.png' }
    ]
    const tree = await createOrganizationUserUtils(organizations, memberships, users).findOrganizationUser()
    assert.equal(tree.length, 1)
    assert.equal(tree[0].members[0].uid, '10001')
    assert.equal(tree[0].members[0].positionName, '总经理')
    assert.equal(tree[0].members.length, 1)
    assert.equal(tree[0].children[0].name, '研发部')
    assert.equal(tree[0].children[0].members[0].name, '李四')
    assert.equal(tree[0].children[0].memberCount, 1)
    assert.equal(tree[0].memberCount, 2)
    assert.equal(tree[0].leader, undefined)
    assert.equal(tree[0].code, undefined)
    assert.equal(tree[0].status, undefined)
    assert.equal(tree[0].createTime, undefined)
    assert.equal(tree[0].modifyTime, undefined)
})

test('上级组织成员数量包含下级启用成员且按用户去重', async () => {
    const organizations = [
        { keyId: 1, parentKeyId: undefined, sort: 10, name: '总部' },
        { keyId: 2, parentKeyId: 1, sort: 10, name: '研发部' },
        { keyId: 3, parentKeyId: 1, sort: 20, name: '产品部' }
    ]
    const memberships = [
        { userUid: '10002', organizationKeyId: 2, isPrimary: true, status: 'enabled' },
        { userUid: '10002', organizationKeyId: 3, isPrimary: false, status: 'enabled' }
    ]
    const users = [{ uid: '10002', number: 'A2', name: '李四', avatar: 'b.png' }]
    const tree = await createOrganizationUserUtils(organizations, memberships, users).findOrganizationUser()
    assert.equal(tree[0].members.length, 0)
    assert.equal(tree[0].children[0].memberCount, 1)
    assert.equal(tree[0].children[1].memberCount, 1)
    assert.equal(tree[0].memberCount, 1)
})

test('组织树人数和成员列表包含未绑定成员关系的负责人', async () => {
    const organizations = [
        { keyId: 1, parentKeyId: undefined, sort: 10, name: '总部', leaderUserUid: '10003' },
        { keyId: 2, parentKeyId: 1, sort: 10, name: '研发部', leaderUserUid: undefined }
    ]
    const memberships = [
        { userUid: '10001', organizationKeyId: 1, isPrimary: true, status: 'enabled' },
        { userUid: '10002', organizationKeyId: 2, isPrimary: true, status: 'enabled' }
    ]
    const users = [
        { uid: '10001', number: 'A1', name: '张三', avatar: 'a.png' },
        { uid: '10002', number: 'A2', name: '李四', avatar: 'b.png' },
        { uid: '10003', number: 'A3', name: '王五', avatar: 'c.png' }
    ]
    const tree = await createOrganizationUserUtils(organizations, memberships, users).findOrganizationUser()
    assert.equal(tree[0].members.length, 2)
    assert.ok(tree[0].members.some(item => item.uid === '10003'))
    assert.equal(tree[0].children[0].memberCount, 1)
    assert.equal(tree[0].memberCount, 3)
})

test('同一组织包含多个启用成员时全部返回', async () => {
    const organizations = [{ keyId: 1, parentKeyId: undefined, sort: 10, name: '总部' }]
    const memberships = [
        { userUid: '10001', organizationKeyId: 1, isPrimary: true, status: 'enabled' },
        { userUid: '10002', organizationKeyId: 1, isPrimary: false, status: 'enabled' },
        { userUid: '10003', organizationKeyId: 1, isPrimary: false, status: 'enabled' }
    ]
    const users = [
        { uid: '10001', number: 'A1', name: '张三', avatar: 'a.png' },
        { uid: '10002', number: 'A2', name: '李四', avatar: 'b.png' },
        { uid: '10003', number: 'A3', name: '王五', avatar: 'c.png' }
    ]
    const tree = await createOrganizationUserUtils(organizations, memberships, users).findOrganizationUser()
    assert.equal(tree[0].members.length, 3)
    assert.equal(tree[0].memberCount, 3)
    assert.deepEqual(tree[0].members.map(item => item.uid).sort(), ['10001', '10002', '10003'])
})

test('新增组织时把负责人绑定为当前组织启用成员', async () => {
    const inserted = []
    const manager = {
        async find(entity, options) {
            assert.equal(entity, TbAccountUserOrganization)
            assert.equal(options.where.userUid, '10001')
            return []
        },
        async insert(entity, payload) {
            inserted.push({ entity, payload })
        },
        async existsBy() {
            return true
        },
        async findOne() {
            return null
        }
    }
    const utils = new OrganizationUtilsService({}, {})
    await utils.ensureLeaderMembership(manager, 8, '10001')
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].entity, TbAccountUserOrganization)
    assert.equal(inserted[0].payload.userUid, '10001')
    assert.equal(inserted[0].payload.organizationKeyId, 8)
    assert.equal(inserted[0].payload.isPrimary, true)
    assert.equal(inserted[0].payload.status, 'enabled')
})

test('负责人已有其他主组织时以非主组织关系绑定', async () => {
    const inserted = []
    const manager = {
        async find() {
            return [{ organizationKeyId: 2, isPrimary: true, status: 'enabled' }]
        },
        async insert(entity, payload) {
            inserted.push(payload)
        },
        async existsBy() {
            return true
        },
        async findOne() {
            return null
        }
    }
    const utils = new OrganizationUtilsService({}, {})
    await utils.ensureLeaderMembership(manager, 8, '10001')
    assert.equal(inserted[0].isPrimary, false)
    assert.equal(inserted[0].organizationKeyId, 8)
})

test('负责人成员关系已禁用时重新启用且不重复插入', async () => {
    const existing = { organizationKeyId: 8, status: 'disabled' }
    let saved = null
    const manager = {
        async find() {
            return [existing]
        },
        async save(entity) {
            saved = entity
        },
        async insert() {
            throw new Error('should not insert')
        },
        async existsBy() {
            return true
        },
        async findOne() {
            return null
        }
    }
    const utils = new OrganizationUtilsService({}, {})
    await utils.ensureLeaderMembership(manager, 8, '10001')
    assert.equal(saved.status, 'enabled')
})

test('负责人已绑定启用成员时不重复写入', async () => {
    const manager = {
        async find() {
            return [{ organizationKeyId: 8, status: 'enabled' }]
        },
        async save() {
            throw new Error('should not save')
        },
        async insert() {
            throw new Error('should not insert')
        },
        async existsBy() {
            return true
        },
        async findOne() {
            return null
        }
    }
    const utils = new OrganizationUtilsService({}, {})
    await utils.ensureLeaderMembership(manager, 8, '10001')
})

test('批量加入组织时为多个账号写入启用成员关系', async () => {
    const inserted = []
    const manager = {
        async transaction(callback) {
            return callback(manager)
        },
        async existsBy() {
            return true
        },
        async find() {
            return []
        },
        async insert(entity, payload) {
            inserted.push({ entity, payload })
        },
        async findOne() {
            return null
        },
        async findOneBy() {
            return { keyId: 8, name: '测试组' }
        }
    }
    const service = createOrganizationService(manager)
    const result = await service.httpBaseAccountUpdateOrganizationUser({ organizationKeyId: 8, uids: ['10001', '10002', '10001'] })
    assert.equal(result.success, true)
    assert.equal(inserted.length, 2)
    assert.deepEqual(
        inserted.map(item => item.payload.userUid),
        ['10001', '10002']
    )
})
