import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

type FinanceMenuSeed = {
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

export type FinanceMenuRepairResult = {
    created: number
    updated: number
    granted: number
    menuKeyIds: number[]
}

export const FINANCE_MENU_SEEDS: FinanceMenuSeed[] = [
    {
        parentPath: null,
        type: 'directory',
        name: '财务中心',
        path: '/finance',
        permissionCode: 'finance:access',
        sort: 30
    },
    {
        parentPath: '/finance',
        type: 'directory',
        name: '基础设置',
        path: '/finance/deploy',
        permissionCode: 'finance:deploy',
        sort: 10
    },
    {
        parentPath: '/finance/deploy',
        type: 'menu',
        name: '品牌管理',
        path: '/finance/deploy/brand',
        routeName: 'FinanceDeployBrand',
        permissionCode: 'finance:brand:list',
        sort: 10
    },
    {
        parentPath: '/finance/deploy',
        type: 'menu',
        name: '币种管理',
        path: '/finance/deploy/currency',
        routeName: 'FinanceDeployCurrency',
        permissionCode: 'finance:currency:list',
        sort: 20
    },
    {
        parentPath: '/finance/deploy',
        type: 'menu',
        name: '汇率管理',
        path: '/finance/deploy/exchange',
        routeName: 'FinanceDeployExchange',
        permissionCode: 'finance:exchange:list',
        sort: 30
    },
    {
        parentPath: '/finance/deploy',
        type: 'menu',
        name: '国家/地区管理',
        path: '/finance/deploy/country',
        routeName: 'FinanceDeployCountry',
        permissionCode: 'finance:country:list',
        sort: 40
    },
    {
        parentPath: '/finance',
        type: 'directory',
        name: '账户管理',
        path: '/finance/account',
        permissionCode: 'finance:account',
        sort: 20
    },
    {
        parentPath: '/finance/account',
        type: 'menu',
        name: '消费用户',
        path: '/finance/account/consumer',
        routeName: 'FinanceAccountConsumer',
        permissionCode: 'finance:consumer:list',
        sort: 10
    },
    {
        parentPath: '/finance',
        type: 'directory',
        name: '资费管理',
        path: '/finance/rates',
        permissionCode: 'finance:rates',
        sort: 30
    },
    {
        parentPath: '/finance/rates',
        type: 'menu',
        name: '短信基础价格',
        path: '/finance/rates/sms',
        routeName: 'FinanceRatesSms',
        permissionCode: 'finance:sms-rate:list',
        sort: 10
    }
]

async function findMenu(connection: Connection, seed: FinanceMenuSeed): Promise<MenuRow | undefined> {
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

/**
 * 补齐管理端已有页面对应的财务菜单，并把子菜单授权给原本拥有财务中心的角色。
 * 只使用菜单、角色的自增 key_id，不引入额外业务 UID。
 */
export async function repairFinanceMenus(connection: Connection): Promise<FinanceMenuRepairResult> {
    let created = 0
    let updated = 0
    const menuKeyIdsByPath = new Map<string, number>()

    for (const seed of FINANCE_MENU_SEEDS) {
        const parentKeyId = seed.parentPath ? menuKeyIdsByPath.get(seed.parentPath) : null
        if (seed.parentPath && !parentKeyId) {
            throw new Error(`财务菜单父节点缺失：${seed.parentPath}`)
        }
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

    const financeRootKeyId = menuKeyIdsByPath.get('/finance')!
    const [grantedRoles] = await connection.execute<RoleRow[]>(
        `SELECT DISTINCT role_key_id AS key_id FROM tb_account_role_menu WHERE menu_key_id = ?
         UNION
         SELECT key_id FROM tb_account_role WHERE code = 'super_admin'`,
        [financeRootKeyId]
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
