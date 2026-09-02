import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

type DatetaskMenuSeed = {
    parentPath: string
    type: 'menu'
    name: string
    path: string
    routeName: string
    permissionCode: string
    sort: number
}

type MenuRow = RowDataPacket & {
    key_id: number
    path: string | null
}

type RoleRow = RowDataPacket & {
    key_id: number
}

export type DatetaskMenuRepairResult = {
    created: number
    updated: number
    granted: number
    menuKeyIds: number[]
}

/**管理端系统任务页面对应的菜单定义。任务由 Skyline 初始化，账号服务只维护页面入口权限。*/
export const DATETASK_MENU_SEEDS: DatetaskMenuSeed[] = [
    {
        parentPath: '/deploy',
        type: 'menu',
        name: '系统任务管理',
        path: '/deploy/datetask/system',
        routeName: 'DeployDatetaskSystem',
        permissionCode: 'skyline:datetask:list',
        sort: 40
    }
]

async function findMenu(connection: Connection, seed: DatetaskMenuSeed): Promise<MenuRow | undefined> {
    const [pathRows] = await connection.execute<MenuRow[]>('SELECT key_id, path FROM tb_account_menu WHERE path = ? LIMIT 1 FOR UPDATE', [
        seed.path
    ])
    if (pathRows[0]) return pathRows[0]
    const [permissionRows] = await connection.execute<MenuRow[]>(
        'SELECT key_id, path FROM tb_account_menu WHERE permission_code = ? LIMIT 1 FOR UPDATE',
        [seed.permissionCode]
    )
    return permissionRows[0]
}

/**补齐系统任务菜单，并授权给已有综合设置权限的角色和超级管理员。*/
export async function repairDatetaskMenus(connection: Connection): Promise<DatetaskMenuRepairResult> {
    let created = 0
    let updated = 0
    const menuKeyIdsByPath = new Map<string, number>()

    for (const seed of DATETASK_MENU_SEEDS) {
        const [parentRows] = await connection.execute<MenuRow[]>(
            'SELECT key_id, path FROM tb_account_menu WHERE path = ? LIMIT 1 FOR UPDATE',
            [seed.parentPath]
        )
        const parentKeyId = parentRows[0]?.key_id
        if (!parentKeyId) throw new Error(`系统任务菜单父节点缺失：${seed.parentPath}`)

        const existing = await findMenu(connection, seed)
        if (existing) {
            await connection.execute(
                `UPDATE tb_account_menu
                    SET parent_key_id = ?, type = ?, name = ?, route_name = ?, path = ?, permission_code = ?, sort = ?, visible = 1, status = 'enabled'
                  WHERE key_id = ?`,
                [parentKeyId, seed.type, seed.name, seed.routeName, seed.path, seed.permissionCode, seed.sort, existing.key_id]
            )
            menuKeyIdsByPath.set(seed.path, existing.key_id)
            updated += 1
            continue
        }

        const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO tb_account_menu
                (parent_key_id, type, name, route_name, path, component, permission_code, icon, external_url,
                 sort, visible, keep_alive, status)
             VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, 1, 1, 'enabled')`,
            [parentKeyId, seed.type, seed.name, seed.routeName, seed.path, seed.permissionCode, seed.sort]
        )
        menuKeyIdsByPath.set(seed.path, result.insertId)
        created += 1
    }

    const [grantedRoles] = await connection.execute<RoleRow[]>(
        `SELECT DISTINCT role_key_id AS key_id FROM tb_account_role_menu WHERE menu_key_id = (SELECT key_id FROM tb_account_menu WHERE path = '/deploy' LIMIT 1)
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
