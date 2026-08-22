import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

type CrmMenuSeed = {
    parentPath: string | null
    type: 'directory' | 'menu'
    name: string
    path: string
    routeName?: string
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

export type CrmMenuRepairResult = {
    created: number
    updated: number
    granted: number
    menuKeyIds: number[]
}

export const CRM_MENU_SEEDS: CrmMenuSeed[] = [
    {
        parentPath: null,
        type: 'directory',
        name: '销售管理',
        path: '/crm',
        permissionCode: 'crm:access',
        sort: 40
    },
    {
        parentPath: '/crm',
        type: 'menu',
        name: '我的客户',
        path: '/crm/consumer',
        routeName: 'CrmConsumer',
        permissionCode: 'crm:consumer:list',
        sort: 10
    },
    {
        parentPath: '/crm',
        type: 'menu',
        name: '合作伙伴',
        path: '/crm/partner',
        routeName: 'CrmPartner',
        permissionCode: 'crm:partner:list',
        sort: 20
    },
    {
        parentPath: '/crm',
        type: 'directory',
        name: '短信业务',
        path: '/crm/sms',
        permissionCode: 'crm:sms',
        sort: 30
    },
    {
        parentPath: '/crm/sms',
        type: 'menu',
        name: '短信报价',
        path: '/crm/sms/quote/create',
        routeName: 'CrmSmsQuoteCreate',
        permissionCode: 'crm:sms-quote:create',
        sort: 10
    },
    {
        parentPath: '/crm/sms',
        type: 'menu',
        name: '报价查询',
        path: '/crm/sms/quote',
        routeName: 'CrmSmsQuote',
        permissionCode: 'crm:sms-quote:list',
        sort: 20
    }
]

async function findMenu(connection: Connection, seed: CrmMenuSeed): Promise<MenuRow | undefined> {
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

/**补齐 CRM 菜单，并将子菜单授权给已有 CRM 根目录权限的角色和超级管理员。*/
export async function repairCrmMenus(connection: Connection): Promise<CrmMenuRepairResult> {
    let created = 0
    let updated = 0
    const menuKeyIdsByPath = new Map<string, number>()

    for (const seed of CRM_MENU_SEEDS) {
        const parentKeyId = seed.parentPath ? menuKeyIdsByPath.get(seed.parentPath) : null
        if (seed.parentPath && !parentKeyId) throw new Error(`CRM 菜单父节点缺失：${seed.parentPath}`)
        const existing = await findMenu(connection, seed)
        if (existing) {
            await connection.execute(
                `UPDATE tb_account_menu
                    SET parent_key_id = ?, type = ?, name = ?, route_name = ?, path = ?, sort = ?, visible = 1, status = 'enabled'
                  WHERE key_id = ?`,
                [parentKeyId, seed.type, seed.name, seed.routeName ?? null, seed.path, seed.sort, existing.key_id]
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
            [parentKeyId, seed.type, seed.name, seed.routeName ?? null, seed.path, seed.permissionCode, seed.sort]
        )
        menuKeyIdsByPath.set(seed.path, result.insertId)
        created += 1
    }

    const crmRootKeyId = menuKeyIdsByPath.get('/crm')!
    const [grantedRoles] = await connection.execute<RoleRow[]>(
        `SELECT DISTINCT role_key_id AS key_id FROM tb_account_role_menu WHERE menu_key_id = ?
         UNION
         SELECT key_id FROM tb_account_role WHERE code = 'super_admin'`,
        [crmRootKeyId]
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
