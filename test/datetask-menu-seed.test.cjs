const test = require('node:test')
const assert = require('node:assert/strict')

const { DATETASK_MENU_SEEDS, repairDatetaskMenus } = require('../dist/cli/datetask-menu.seed')

test('系统任务菜单种子挂载到任务管理目录并使用 Skyline 权限', () => {
    assert.deepEqual(DATETASK_MENU_SEEDS, [
        {
            parentPath: '/deploy',
            type: 'directory',
            name: '任务管理',
            path: '/deploy/datetask',
            permissionCode: 'skyline:datetask',
            sort: 40
        },
        {
            parentPath: '/deploy/datetask',
            type: 'menu',
            name: '系统任务管理',
            path: '/deploy/datetask/system',
            routeName: 'DeployDatetaskSystem',
            permissionCode: 'skyline:datetask:list',
            sort: 40
        }
    ])
})

test('系统任务菜单修复会创建任务管理目录和菜单并授权综合设置角色', async () => {
    const statements = []
    const connection = {
        async execute(sql, params = []) {
            statements.push({ sql, params })
            if (sql.includes('path = ?') && params[0] === '/deploy') return [[{ key_id: 67, path: '/deploy' }]]
            if (sql.includes('path = ?')) {
                if (params[0] === '/deploy/datetask') return [[]]
                if (params[0] === '/deploy/datetask/system') return [[]]
                return [[]]
            }
            if (sql.includes('permission_code = ?')) return [[]]
            if (sql.startsWith('INSERT INTO tb_account_menu')) {
                const insertCount = statements.filter(item => item.sql.startsWith('INSERT INTO tb_account_menu')).length
                return [{ insertId: 105 + insertCount, affectedRows: 1 }]
            }
            if (sql.startsWith('SELECT DISTINCT role_key_id')) return [[{ key_id: 3 }]]
            if (sql.startsWith('INSERT IGNORE INTO tb_account_role_menu')) return [{ affectedRows: 1 }]
            throw new Error(`unexpected SQL: ${sql}`)
        }
    }

    const result = await repairDatetaskMenus(connection)
    assert.deepEqual(result, { created: 2, updated: 0, granted: 2, menuKeyIds: [106, 107] })
    const grantQuery = statements.find(item => item.sql.startsWith('SELECT DISTINCT role_key_id'))
    assert.match(grantQuery.sql, /path = '\/deploy'/)
})

test('系统任务菜单修复已存在时只更新并保持幂等授权', async () => {
    const updates = []
    const connection = {
        async execute(sql, params = []) {
            if (sql.startsWith('UPDATE tb_account_menu')) {
                updates.push({ sql, params })
                return [{ affectedRows: 1 }]
            }
            if (sql.includes('path = ?')) {
                if (params[0] === '/deploy') return [[{ key_id: 67, path: '/deploy' }]]
                if (params[0] === '/deploy/datetask') return [[{ key_id: 105, path: '/deploy/datetask' }]]
                return [[{ key_id: 106, path: '/deploy/datetask/system' }]]
            }
            if (sql.includes('permission_code = ?')) {
                if (params[0] === 'skyline:datetask') return [[{ key_id: 105, path: '/deploy/datetask' }]]
                return [[{ key_id: 106, path: '/deploy/datetask/system' }]]
            }
            if (sql.startsWith('SELECT DISTINCT role_key_id')) return [[{ key_id: 3 }]]
            if (sql.startsWith('INSERT IGNORE INTO tb_account_role_menu')) return [{ affectedRows: 0 }]
            throw new Error(`unexpected SQL: ${sql}`)
        }
    }

    const result = await repairDatetaskMenus(connection)
    assert.equal(result.created, 0)
    assert.equal(result.updated, 2)
    assert.equal(result.granted, 0)
    assert.equal(updates.length, 2)
    assert.match(updates[0].sql, /permission_code = \?/)
})
