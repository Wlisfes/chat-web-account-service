const test = require('node:test')
const assert = require('node:assert/strict')

const { POSITION_MENU_SEEDS, repairPositionMenus } = require('../dist/cli/position-menu.seed')

test('职位菜单种子声明系统职位路由和权限', () => {
    assert.deepEqual(POSITION_MENU_SEEDS, [
        {
            parentPath: '/deploy/system',
            type: 'menu',
            name: '职位管理',
            path: '/deploy/system/position',
            routeName: 'DeploySystemPosition',
            permissionCode: 'account:position:list',
            sort: 50
        }
    ])
})

test('职位菜单修复会创建菜单并授权已有系统管理角色', async () => {
    const statements = []
    let childPathLookups = 0
    const connection = {
        async execute(sql, params = []) {
            statements.push(sql)
            if (sql.includes('path = ?') && params[0] === '/deploy/system') return [[{ key_id: 10, path: '/deploy/system' }]]
            if (sql.includes('path = ?') && params[0] === '/deploy/system/position') {
                childPathLookups += 1
                return childPathLookups === 1 ? [[]] : [[{ key_id: 11, path: '/deploy/system/position' }]]
            }
            if (sql.includes('path = ?')) return [[]]
            if (sql.includes('permission_code = ?')) return [[]]
            if (sql.startsWith('INSERT INTO tb_account_menu')) {
                return [
                    { insertId: 11 + statements.filter(item => item.startsWith('INSERT INTO tb_account_menu')).length - 1, affectedRows: 1 }
                ]
            }
            if (sql.startsWith('SELECT DISTINCT role_key_id')) return [[{ key_id: 3 }]]
            if (sql.startsWith('INSERT IGNORE INTO tb_account_role_menu')) return [{ affectedRows: 1 }]
            throw new Error(`unexpected SQL: ${sql}`)
        }
    }
    const result = await repairPositionMenus(connection)
    assert.equal(result.created, 4)
    assert.equal(result.updated, 0)
    assert.equal(result.granted, 4)
    assert.ok(statements.some(sql => sql.startsWith('INSERT INTO tb_account_menu')))
    assert.ok(statements.some(sql => sql.startsWith('INSERT IGNORE INTO tb_account_role_menu')))
})

test('职位菜单修复已存在时只更新并保持幂等授权', async () => {
    const updates = []
    const connection = {
        async execute(sql, params = []) {
            if (sql.includes('path = ?')) {
                if (params[0] === '/deploy/system') return [[{ key_id: 10, path: '/deploy/system' }]]
                return [[{ key_id: 11, path: '/deploy/system/position' }]]
            }
            if (sql.includes('permission_code = ?')) return [[{ key_id: 12, path: null }]]
            if (sql.startsWith('UPDATE tb_account_menu')) {
                updates.push({ sql, params })
                return [{ affectedRows: 1 }]
            }
            if (sql.startsWith('SELECT DISTINCT role_key_id')) return [[{ key_id: 3 }]]
            if (sql.startsWith('INSERT IGNORE INTO tb_account_role_menu')) return [{ affectedRows: 0 }]
            throw new Error(`unexpected SQL: ${sql}`)
        }
    }
    const result = await repairPositionMenus(connection)
    assert.equal(result.created, 0)
    assert.equal(result.updated, 4)
    assert.equal(result.granted, 0)
    assert.ok(updates.every(item => item.sql.includes('permission_code = ?')))
})
