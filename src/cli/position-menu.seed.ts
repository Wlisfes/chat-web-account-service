import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

type PositionMenuSeed = {
    parentPath: string | null
    type: 'directory' | 'menu' | 'button'
    name: string
    path: string | null
    routeName?: string
    permissionCode: string
    sort: number
}

type MenuRow = RowDataPacket & { key_id: number; path: string | null }
type RoleRow = RowDataPacket & { key_id: number }

export type PositionMenuRepairResult = { created: number; updated: number; granted: number; menuKeyIds: number[] }

export const POSITION_MENU_SEEDS: PositionMenuSeed[] = [
    {
        parentPath: '/deploy/system',
        type: 'menu',
        name: '职位管理',
        path: '/deploy/system/position',
        routeName: 'DeploySystemPosition',
        permissionCode: 'account:position:list',
        sort: 50
    }
]

const POSITION_BUTTON_SEEDS: PositionMenuSeed[] = [
    {
        parentPath: '/deploy/system/position',
        type: 'button',
        name: '新增职位',
        path: null,
        permissionCode: 'account:position:create',
        sort: 10
    },
    {
        parentPath: '/deploy/system/position',
        type: 'button',
        name: '编辑职位',
        path: null,
        permissionCode: 'account:position:update',
        sort: 20
    },
    {
        parentPath: '/deploy/system/position',
        type: 'button',
        name: '删除职位',
        path: null,
        permissionCode: 'account:position:delete',
        sort: 30
    }
]

async function findMenu(connection: Connection, seed: PositionMenuSeed): Promise<MenuRow | undefined> {
    if (seed.path) {
        const [pathRows] = await connection.execute<MenuRow[]>(
            'SELECT key_id, path FROM tb_account_menu WHERE path = ? LIMIT 1 FOR UPDATE',
            [seed.path]
        )
        if (pathRows[0]) return pathRows[0]
    }
    const [permissionRows] = await connection.execute<MenuRow[]>(
        'SELECT key_id, path FROM tb_account_menu WHERE permission_code = ? LIMIT 1 FOR UPDATE',
        [seed.permissionCode]
    )
    return permissionRows[0]
}

/**补齐职位管理菜单，并将其授权给已有系统管理根目录权限的角色和超级管理员。*/
export async function repairPositionMenus(connection: Connection): Promise<PositionMenuRepairResult> {
    let created = 0
    let updated = 0
    const menuKeyIdsByPath = new Map<string, number>()
    for (const seed of [...POSITION_MENU_SEEDS, ...POSITION_BUTTON_SEEDS]) {
        const [parentRows] = await connection.execute<MenuRow[]>(
            'SELECT key_id, path FROM tb_account_menu WHERE path = ? LIMIT 1 FOR UPDATE',
            [seed.parentPath]
        )
        const parentKeyId = parentRows[0]?.key_id || (seed.parentPath ? menuKeyIdsByPath.get(seed.parentPath) : undefined)
        if (!parentKeyId) throw new Error(`职位菜单父节点缺失：${seed.parentPath}`)
        const existing = await findMenu(connection, seed)
        if (existing) {
            await connection.execute(
                `UPDATE tb_account_menu
                    SET parent_key_id = ?, type = ?, name = ?, route_name = ?, path = ?, permission_code = ?, sort = ?, visible = 1, status = 'enabled'
                  WHERE key_id = ?`,
                [parentKeyId, seed.type, seed.name, seed.routeName ?? null, seed.path, seed.permissionCode, seed.sort, existing.key_id]
            )
            menuKeyIdsByPath.set(seed.path ?? seed.permissionCode, existing.key_id)
            updated += 1
            continue
        }
        const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO tb_account_menu
                (parent_key_id, type, name, route_name, path, component, permission_code, icon, external_url,
                 sort, visible, keep_alive, status)
             VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, 1, 1, 'enabled')`,
            [parentKeyId, seed.type, seed.name, seed.routeName ?? null, seed.path, seed.permissionCode, seed.sort]
        )
        menuKeyIdsByPath.set(seed.path ?? seed.permissionCode, result.insertId)
        created += 1
    }
    const [grantedRoles] = await connection.execute<RoleRow[]>(
        `SELECT DISTINCT role_key_id AS key_id FROM tb_account_role_menu WHERE menu_key_id = (SELECT key_id FROM tb_account_menu WHERE path = '/deploy/system' LIMIT 1)
         UNION
         SELECT key_id FROM tb_account_role WHERE code = 'super_admin'`,
        []
    )
    let granted = 0
    for (const role of grantedRoles) {
        for (const menuKeyId of menuKeyIdsByPath.values()) {
            const [result] = await connection.execute<ResultSetHeader>(
                'INSERT IGNORE INTO tb_account_role_menu (role_key_id, menu_key_id) VALUES (?, ?)',
                [role.key_id, menuKeyId]
            )
            granted += result.affectedRows
        }
    }
    return { created, updated, granted, menuKeyIds: [...menuKeyIdsByPath.values()] }
}
