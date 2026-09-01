const test = require('node:test')
const assert = require('node:assert/strict')

const { SheetService } = require('../dist/modules/sheet/sheet.service')

const menus = [
    { keyId: 1, parentKeyId: null, sort: 30, name: '系统管理' },
    { keyId: 2, parentKeyId: null, sort: 20, name: '业务管理' },
    { keyId: 3, parentKeyId: 1, sort: 10, name: '用户管理' },
    { keyId: 4, parentKeyId: 3, sort: 10, name: '用户列表' },
    { keyId: 5, parentKeyId: 1, sort: 20, name: '角色管理' }
]

function fakeRepository(rows) {
    const queries = []
    return {
        queries,
        createQueryBuilder() {
            const state = { conditions: [], params: {}, orderBy: undefined, skip: 0, take: rows.length }
            queries.push(state)
            return {
                where(expression, params) {
                    state.conditions.push(expression)
                    Object.assign(state.params, params)
                    return this
                },
                andWhere(expression, params) {
                    state.conditions.push(expression)
                    Object.assign(state.params, params)
                    return this
                },
                orderBy(expression, direction) {
                    state.orderBy = { expression, direction }
                    return this
                },
                addOrderBy(expression, direction) {
                    state.orderBy ??= { expression, direction }
                    return this
                },
                skip(value) {
                    state.skip = value
                    return this
                },
                take(value) {
                    state.take = value
                    return this
                },
                async getManyAndCount() {
                    const parentKeyId = state.params.parentKeyId
                    const condition = state.conditions[0]
                    const matched = condition.includes('IS NULL')
                        ? rows.filter(item => item.parentKeyId === null)
                        : rows.filter(item => item.keyId === parentKeyId || item.parentKeyId === parentKeyId)
                    const ordered = [...matched].sort((left, right) => {
                        if (state.orderBy?.expression.includes('CASE')) {
                            const leftPriority = left.keyId === parentKeyId ? 0 : 1
                            const rightPriority = right.keyId === parentKeyId ? 0 : 1
                            if (leftPriority !== rightPriority) return leftPriority - rightPriority
                        }
                        return left.sort - right.sort || left.keyId - right.keyId
                    })
                    return [ordered.slice(state.skip, state.skip + state.take), ordered.length]
                }
            }
        }
    }
}

function fakeDatabaseService() {
    const calls = []
    return {
        calls,
        builder(repository, callback) {
            calls.push(repository)
            return callback(repository.createQueryBuilder('t'))
        }
    }
}

test('菜单 column 未传 parentKeyId 时只返回一级平铺节点', async () => {
    const repository = fakeRepository(menus)
    const service = new SheetService(repository, fakeDatabaseService())

    const result = await service.httpBaseAccountColumnSheet({ page: 1, size: 50 })

    assert.deepEqual(
        result.list.map(item => item.keyId),
        [2, 1]
    )
    assert.equal(result.total, 2)
    assert.ok(result.list.every(item => !Object.hasOwn(item, 'children')))
    assert.equal(repository.queries.length, 1)
})

test('菜单 column 传 parentKeyId 时返回父节点和一层直接下级', async () => {
    const repository = fakeRepository(menus)
    const service = new SheetService(repository, fakeDatabaseService())

    const result = await service.httpBaseAccountColumnSheet({ page: 1, size: 50, parentKeyId: 1 })

    assert.deepEqual(
        result.list.map(item => item.keyId),
        [1, 3, 5]
    )
    assert.equal(result.total, 3)
    assert.ok(result.list.every(item => !Object.hasOwn(item, 'children')))
    assert.equal(repository.queries.length, 1)
})

test('菜单 column 使用共享数据库查询构造器', async () => {
    const repository = fakeRepository(menus)
    const database = fakeDatabaseService()
    const service = new SheetService(repository, database)

    await service.httpBaseAccountColumnSheet({ page: 1, size: 10 })

    assert.equal(database.calls.length, 1)
})

test('菜单 column 保留名称、权限码和路由筛选条件', async () => {
    const repository = fakeRepository(menus)
    const service = new SheetService(repository, fakeDatabaseService())

    await service.httpBaseAccountColumnSheet({
        page: 1,
        size: 10,
        name: '用户',
        permissionCode: 'account:user',
        path: '/system/user'
    })

    const query = repository.queries[0]
    assert.ok(query.conditions.some(condition => condition.startsWith('t.name LIKE :name')))
    assert.ok(query.conditions.some(condition => condition.startsWith('t.permissionCode LIKE :permissionCode')))
    assert.ok(query.conditions.some(condition => condition.startsWith('t.path LIKE :path')))
    assert.equal(query.params.name, '%用户%')
    assert.equal(query.params.permissionCode, '%account:user%')
    assert.equal(query.params.path, '%/system/user%')
})

test('菜单删除返回与接口文档一致的成功结果', async () => {
    const manager = {
        async existsBy() {
            return false
        },
        async delete() {
            return { affected: 1 }
        }
    }
    const repository = {
        manager: {
            async transaction(callback) {
                return callback(manager)
            }
        }
    }
    const sheetUtilsService = {
        async lockTree(transactionManager) {
            assert.equal(transactionManager, manager)
        },
        async findRequired(keyId, transactionManager) {
            assert.equal(keyId, 1)
            assert.equal(transactionManager, manager)
            return { keyId }
        }
    }
    const service = new SheetService(repository, {}, sheetUtilsService)

    assert.deepEqual(await service.httpBaseAccountDeleteSheet({ keyId: 1 }), { success: true })
})
