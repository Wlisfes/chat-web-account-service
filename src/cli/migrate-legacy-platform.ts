import { randomUUID } from 'node:crypto'
import yaml from 'js-yaml'
import type { ExecuteValues } from 'mysql2'
import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { repairFinanceMenus } from '@/cli/finance-menu.seed'
import { getNacosAccessToken, withNacosAccessToken } from '@/cli/nacos-auth'

export type DatabaseConfig = {
    host: string
    port?: number | string
    username: string
    password: string
    database?: string
    name?: string
    charset?: string
    timezone?: string
}

type LegacyBaseRow = RowDataPacket & {
    id: number
    create_time: Date
    modify_time: Date
}

type LegacyUser = LegacyBaseRow & {
    uid: string
    number: string
    phone: string
    email: string | null
    name: string
    avatar: string | null
    status: string
}

type LegacyOrganization = LegacyBaseRow & {
    key_id: string
    name: string
    pid: string | null
    bit: string | null
}

type LegacyRole = LegacyBaseRow & {
    key_id: string
    name: string
    status: string
    comment: string | null
    sort: number
    dept: number
}

type LegacyMenu = LegacyBaseRow & {
    key_id: string
    key: string
    name: string
    router: string | null
    icon_name: string | null
    pid: string | null
    type: string
    status: string
    sort: number
}

type LegacyMembership = LegacyBaseRow & {
    key_id: string
    uid: string
}

type LegacyRoleMenu = LegacyBaseRow & {
    key_id: string
    sid: string
}

type MigrationOptions = {
    apply: boolean
    sourceDatabase: string
    initialAdminAccount?: string
    initialAdminPasswordHash?: string
}

const REQUIRED_SOURCE_TABLES = [
    'tb_system_dept',
    'tb_system_dept_join_user',
    'tb_system_role',
    'tb_system_role_join_router',
    'tb_system_role_join_user',
    'tb_system_router',
    'tb_system_user'
]

const EMPTY_TARGET_TABLES = [
    'tb_account_user',
    'tb_account_organization',
    'tb_account_organization_closure',
    'tb_account_user_organization',
    'tb_account_menu',
    'tb_account_user_role',
    'tb_account_role_menu',
    'tb_account_role_data_scope',
    'tb_account_role_data_scope_organization',
    'tb_account_position',
    'tb_account_user_position'
]

const ROUTE_PATH_MAP = new Map([
    ['/deploy/system/router', '/deploy/system/sheet'],
    ['/deploy/system/user', '/deploy/system/account'],
    ['/deploy/system/position', '/deploy/system/position']
])

const VISIBLE_ROUTE_PATHS = new Set([
    '/manager',
    '/finance',
    '/deploy',
    '/deploy/system',
    '/deploy/system/sheet',
    '/deploy/system/role',
    '/deploy/system/account',
    '/deploy/system/dept',
    '/deploy/system/position'
])

const PERMISSION_CODE_MAP = new Map([
    ['base:deploy:system:router', 'account:menu:list'],
    ['base:deploy:system:router:add', 'account:menu:create'],
    ['base:deploy:system:router:edit', 'account:menu:update'],
    ['base:deploy:system:router:delete', 'account:menu:delete'],
    ['base:deploy:system:role', 'account:role:list'],
    ['base:deploy:system:user', 'account:user:list'],
    ['base:deploy:system:dept', 'account:organization:list'],
    ['base:deploy:system:position', 'account:position:list']
])

const EXTRA_PERMISSION_BUTTONS = [
    { parentPermission: 'account:role:list', name: '新增角色', permissionCode: 'account:role:create', sort: 10 },
    { parentPermission: 'account:role:list', name: '编辑角色', permissionCode: 'account:role:update', sort: 20 },
    { parentPermission: 'account:role:list', name: '删除角色', permissionCode: 'account:role:delete', sort: 30 },
    { parentPermission: 'account:role:list', name: '授权角色', permissionCode: 'account:role:grant', sort: 40 },
    { parentPermission: 'account:user:list', name: '新增用户', permissionCode: 'account:user:create', sort: 10 },
    { parentPermission: 'account:user:list', name: '编辑用户', permissionCode: 'account:user:update', sort: 20 },
    { parentPermission: 'account:user:list', name: '重置密码', permissionCode: 'account:user:password:reset', sort: 30 },
    { parentPermission: 'account:user:list', name: '分配组织', permissionCode: 'account:user:organization:assign', sort: 40 },
    { parentPermission: 'account:user:list', name: '分配角色', permissionCode: 'account:user:role:assign', sort: 50 },
    { parentPermission: 'account:organization:list', name: '新增组织', permissionCode: 'account:organization:create', sort: 10 },
    { parentPermission: 'account:organization:list', name: '编辑组织', permissionCode: 'account:organization:update', sort: 20 },
    { parentPermission: 'account:organization:list', name: '删除组织', permissionCode: 'account:organization:delete', sort: 30 },
    { parentPermission: 'account:position:list', name: '新增职位', permissionCode: 'account:position:create', sort: 10 },
    { parentPermission: 'account:position:list', name: '编辑职位', permissionCode: 'account:position:update', sort: 20 },
    { parentPermission: 'account:position:list', name: '删除职位', permissionCode: 'account:position:delete', sort: 30 }
]

function requiredEnvironment(key: string): string {
    const value = process.env[key]?.trim()
    if (!value) throw new Error(`缺少环境变量：${key}`)
    return value
}

function assertIdentifier(value: string, label: string): string {
    if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`${label}只能包含字母、数字和下划线`)
    return value
}

function sourceTable(sourceDatabase: string, table: string): string {
    return `\`${assertIdentifier(sourceDatabase, '旧库名称')}\`.\`${assertIdentifier(table, '旧表名称')}\``
}

export async function loadDatabaseConfig(): Promise<DatabaseConfig> {
    const directHost = process.env.ACCOUNT_MYSQL_HOST?.trim()
    const directUsername = process.env.ACCOUNT_MYSQL_USERNAME?.trim()
    const directPassword = process.env.ACCOUNT_MYSQL_PASSWORD
    const directDatabase = process.env.ACCOUNT_MYSQL_DATABASE?.trim()
    if (directHost && directUsername && directPassword !== undefined && directDatabase) {
        return {
            host: directHost,
            port: process.env.ACCOUNT_MYSQL_PORT || 3306,
            username: directUsername,
            password: directPassword,
            database: directDatabase,
            charset: process.env.ACCOUNT_MYSQL_CHARSET || 'utf8mb4',
            timezone: process.env.ACCOUNT_MYSQL_TIMEZONE || '+08:00'
        }
    }

    const server = requiredEnvironment('NACOS_SERVER')
    const baseUrl = /^https?:\/\//i.test(server) ? server : `http://${server}`
    const params = withNacosAccessToken(
        new URLSearchParams({
            dataId: requiredEnvironment('NACOS_CONFIG_DATA_ID'),
            group: process.env.NACOS_CONFIG_GROUP?.trim() || process.env.NACOS_GROUP?.trim() || 'DEFAULT_GROUP',
            tenant: process.env.NACOS_NAMESPACE?.trim() || 'public'
        }),
        await getNacosAccessToken(baseUrl)
    )
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/nacos/v1/cs/configs?${params}`)
    if (!response.ok) throw new Error(`读取 Nacos 配置失败：HTTP ${response.status}`)
    const config = yaml.load(await response.text()) as Record<string, unknown>
    const databaseRoot = config?.database as Record<string, unknown> | undefined
    const database = databaseRoot?.['chat-web-account']
    if (!database || typeof database !== 'object' || Array.isArray(database)) {
        throw new Error('缺少 Nacos 数据库配置节点：database.chat-web-account')
    }
    return database as DatabaseConfig
}

function parseOptions(): MigrationOptions {
    const apply = process.argv.includes('--apply')
    const sourceDatabase = assertIdentifier(process.env.LEGACY_MYSQL_DATABASE?.trim() || 'legacy_platform_20260818', '旧库名称')
    const initialAdminAccount = process.env.INITIAL_ADMIN_ACCOUNT?.trim()
    const initialAdminPasswordHash = process.env.INITIAL_ADMIN_PASSWORD_HASH?.trim()
    if (apply && !initialAdminAccount) throw new Error('正式迁移必须设置 INITIAL_ADMIN_ACCOUNT')
    if (apply && !initialAdminPasswordHash) throw new Error('正式迁移必须设置 INITIAL_ADMIN_PASSWORD_HASH')
    if (initialAdminPasswordHash && !isValidScryptHash(initialAdminPasswordHash)) {
        throw new Error('INITIAL_ADMIN_PASSWORD_HASH 必须由当前 PasswordService 生成')
    }
    return { apply, sourceDatabase, initialAdminAccount, initialAdminPasswordHash }
}

function isValidScryptHash(value: string): boolean {
    const [algorithm, nText, rText, pText, saltText, hashText, extra] = value.split('$')
    const n = Number(nText)
    const r = Number(rText)
    const p = Number(pText)
    if (
        algorithm !== 'scrypt-v1' ||
        extra !== undefined ||
        !Number.isInteger(n) ||
        n < 16_384 ||
        n > 65_536 ||
        !Number.isInteger(r) ||
        r < 1 ||
        r > 32 ||
        !Number.isInteger(p) ||
        p < 1 ||
        p > 8 ||
        !saltText ||
        !hashText
    ) {
        return false
    }
    try {
        return Buffer.from(saltText, 'base64url').length >= 16 && Buffer.from(hashText, 'base64url').length === 64
    } catch {
        return false
    }
}

async function selectRows<TRow extends RowDataPacket>(
    connection: Connection,
    sql: string,
    parameters: ExecuteValues[] = []
): Promise<TRow[]> {
    const [rows] = await connection.execute<TRow[]>(sql, parameters)
    return rows
}

function sortTree<TNode extends { key_id: string; pid: string | null }>(nodes: TNode[], label: string): TNode[] {
    const remaining = new Map(nodes.map(node => [node.key_id, node]))
    const result: TNode[] = []
    const inserted = new Set<string>()
    while (remaining.size) {
        let progressed = false
        for (const [key, node] of remaining) {
            if (node.pid && !inserted.has(node.pid)) continue
            result.push(node)
            inserted.add(key)
            remaining.delete(key)
            progressed = true
        }
        if (!progressed) throw new Error(`${label}存在循环或缺失父节点`)
    }
    return result
}

function resetRequiredPassword(): string {
    return `reset-required$${randomUUID().replace(/-/g, '')}`
}

function mapStatus(status: string): 'enabled' | 'disabled' {
    return status === 'enable' ? 'enabled' : 'disabled'
}

async function assertSource(connection: Connection, sourceDatabase: string): Promise<void> {
    const existingTables = await selectRows<RowDataPacket & { table_name: string }>(
        connection,
        `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = ?`,
        [sourceDatabase]
    )
    const existing = new Set(existingTables.map(row => row.table_name))
    const missing = REQUIRED_SOURCE_TABLES.filter(table => !existing.has(table))
    if (missing.length) throw new Error(`旧库缺少表：${missing.join(', ')}`)

    const duplicateChecks = [
        ['用户UID', 'tb_system_user', 'uid'],
        ['用户工号', 'tb_system_user', 'number'],
        ['用户手机', 'tb_system_user', 'phone'],
        ['组织旧ID', 'tb_system_dept', 'key_id'],
        ['角色旧ID', 'tb_system_role', 'key_id'],
        ['菜单旧ID', 'tb_system_router', 'key_id']
    ] as const
    for (const [label, table, column] of duplicateChecks) {
        const rows = await selectRows<RowDataPacket & { duplicate_count: number }>(
            connection,
            `SELECT COUNT(*) AS duplicate_count FROM (
                SELECT \`${column}\` FROM ${sourceTable(sourceDatabase, table)} GROUP BY \`${column}\` HAVING COUNT(*) > 1
            ) duplicate_values`
        )
        if (Number(rows[0].duplicate_count) > 0) throw new Error(`旧库${label}存在重复值`)
    }
}

async function assertTarget(connection: Connection): Promise<number> {
    for (const table of EMPTY_TARGET_TABLES) {
        const rows = await selectRows<RowDataPacket & { row_count: number }>(connection, `SELECT COUNT(*) AS row_count FROM \`${table}\``)
        if (Number(rows[0].row_count) !== 0) throw new Error(`目标表 ${table} 不是空表，拒绝覆盖式迁移`)
    }
    const roles = await selectRows<RowDataPacket & { key_id: number; code: string }>(
        connection,
        `SELECT key_id, code FROM tb_account_role ORDER BY key_id`
    )
    if (roles.length !== 1 || roles[0].code !== 'super_admin') throw new Error('目标角色表必须只包含内置 super_admin')
    return roles[0].key_id
}

async function insertAndGetId(connection: Connection, sql: string, parameters: ExecuteValues[]): Promise<number> {
    const [result] = await connection.execute<ResultSetHeader>(sql, parameters)
    return result.insertId
}

async function migrate(connection: Connection, options: MigrationOptions, superAdminRoleKeyId: number) {
    const source = options.sourceDatabase
    const users = await selectRows<LegacyUser>(connection, `SELECT * FROM ${sourceTable(source, 'tb_system_user')} ORDER BY id`)
    const organizations = sortTree(
        await selectRows<LegacyOrganization>(connection, `SELECT * FROM ${sourceTable(source, 'tb_system_dept')} ORDER BY id`),
        '旧组织树'
    )
    const roles = await selectRows<LegacyRole>(connection, `SELECT * FROM ${sourceTable(source, 'tb_system_role')} ORDER BY id`)
    const menus = sortTree(
        await selectRows<LegacyMenu>(connection, `SELECT * FROM ${sourceTable(source, 'tb_system_router')} ORDER BY sort, id`),
        '旧菜单树'
    )
    const memberships = await selectRows<LegacyMembership>(
        connection,
        `SELECT * FROM ${sourceTable(source, 'tb_system_dept_join_user')} ORDER BY id`
    )
    const userRoles = await selectRows<LegacyMembership>(
        connection,
        `SELECT * FROM ${sourceTable(source, 'tb_system_role_join_user')} ORDER BY id`
    )
    const roleMenus = await selectRows<LegacyRoleMenu>(
        connection,
        `SELECT * FROM ${sourceTable(source, 'tb_system_role_join_router')} ORDER BY id`
    )
    if (!users.length || !organizations.length || !roles.length) throw new Error('旧库用户、组织或角色为空')

    const selectedAdmin = options.initialAdminAccount
        ? users.filter(
              user =>
                  user.number.trim() === options.initialAdminAccount ||
                  user.phone.trim() === options.initialAdminAccount ||
                  user.email?.trim() === options.initialAdminAccount
          )
        : [users[0]]
    if (selectedAdmin.length !== 1) throw new Error('INITIAL_ADMIN_ACCOUNT 未唯一匹配旧用户')

    const usedEmails = new Set<string>()
    let duplicateEmailsResetToNull = 0
    for (const user of users) {
        const email = user.email?.trim() || null
        const emailKey = email?.toLocaleLowerCase('en-US')
        const migratedEmail = emailKey && !usedEmails.has(emailKey) ? email : null
        if (emailKey && usedEmails.has(emailKey)) duplicateEmailsResetToNull += 1
        if (emailKey) usedEmails.add(emailKey)
        await connection.execute(
            `INSERT INTO tb_account_user
                (uid, number, phone, email, name, avatar, status, employment_status, password,
                 last_login_time, employment_time, resignation_time, create_time, modify_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'employed', ?, NULL, ?, NULL, ?, ?)`,
            [
                user.uid,
                user.number.trim(),
                user.phone.trim(),
                migratedEmail,
                user.name.trim(),
                user.avatar,
                mapStatus(user.status),
                resetRequiredPassword(),
                user.create_time,
                user.create_time,
                user.modify_time
            ]
        )
    }

    const organizationKeyMap = new Map<string, number>()
    const organizationByLegacyKey = new Map(organizations.map(item => [item.key_id, item]))
    for (const organization of organizations) {
        const parentKeyId = organization.pid ? organizationKeyMap.get(organization.pid) : null
        const code = organization.bit?.trim() ? `legacy_${organization.bit.trim()}` : `legacy_${organization.key_id}`
        const keyId = await insertAndGetId(
            connection,
            `INSERT INTO tb_account_organization
                (parent_key_id, code, name, type, leader_user_uid, sort, status, create_time, modify_time)
             VALUES (?, ?, ?, ?, NULL, ?, 'enabled', ?, ?)`,
            [
                parentKeyId,
                code,
                organization.name.trim(),
                organization.pid ? 'department' : 'company',
                organization.id,
                organization.create_time,
                organization.modify_time
            ]
        )
        organizationKeyMap.set(organization.key_id, keyId)
    }

    for (const organization of organizations) {
        const descendantKeyId = organizationKeyMap.get(organization.key_id)!
        await connection.execute(
            `INSERT INTO tb_account_organization_closure (ancestor_key_id, descendant_key_id, depth) VALUES (?, ?, 0)`,
            [descendantKeyId, descendantKeyId]
        )
        let parentLegacyKey = organization.pid
        let depth = 1
        while (parentLegacyKey) {
            const ancestorKeyId = organizationKeyMap.get(parentLegacyKey)
            if (!ancestorKeyId) throw new Error(`组织祖先映射缺失：${parentLegacyKey}`)
            await connection.execute(
                `INSERT INTO tb_account_organization_closure (ancestor_key_id, descendant_key_id, depth) VALUES (?, ?, ?)`,
                [ancestorKeyId, descendantKeyId, depth]
            )
            parentLegacyKey = organizationByLegacyKey.get(parentLegacyKey)?.pid ?? null
            depth += 1
        }
    }

    const roleKeyMap = new Map<string, number>()
    for (const role of roles) {
        if (!role.dept) {
            roleKeyMap.set(role.key_id, superAdminRoleKeyId)
            continue
        }
        if (!organizationKeyMap.has(role.key_id)) throw new Error(`部门角色没有同ID组织：${role.key_id}`)
        const roleKeyId = await insertAndGetId(
            connection,
            `INSERT INTO tb_account_role (code, name, description, sort, builtin, status, create_time, modify_time)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
            [
                `legacy_dept_${role.key_id}`,
                role.name.trim(),
                role.comment?.trim() || `迁移自旧平台部门角色 ${role.key_id}`,
                role.sort,
                mapStatus(role.status),
                role.create_time,
                role.modify_time
            ]
        )
        roleKeyMap.set(role.key_id, roleKeyId)
        const scopeKeyId = await insertAndGetId(
            connection,
            `INSERT INTO tb_account_role_data_scope (role_key_id, resource_code, scope_type, status, create_time, modify_time)
             VALUES (?, '*', 'custom', 'enabled', ?, ?)`,
            [roleKeyId, role.create_time, role.modify_time]
        )
        await connection.execute(
            `INSERT INTO tb_account_role_data_scope_organization
                (data_scope_key_id, organization_key_id, include_children, create_time, modify_time)
             VALUES (?, ?, 1, ?, ?)`,
            [scopeKeyId, organizationKeyMap.get(role.key_id), role.create_time, role.modify_time]
        )
    }

    const membershipsByUser = new Map<string, LegacyMembership[]>()
    for (const membership of memberships) {
        const items = membershipsByUser.get(membership.uid) ?? []
        items.push(membership)
        membershipsByUser.set(membership.uid, items)
    }
    for (const [userUid, items] of membershipsByUser) {
        for (let index = 0; index < items.length; index += 1) {
            const membership = items[index]
            const organizationKeyId = organizationKeyMap.get(membership.key_id)
            if (!organizationKeyId) throw new Error(`用户组织映射缺失：${membership.key_id}`)
            await connection.execute(
                `INSERT INTO tb_account_user_organization
                    (user_uid, organization_key_id, is_primary, position_name, status, create_time, modify_time)
                 VALUES (?, ?, ?, NULL, 'enabled', ?, ?)`,
                [userUid, organizationKeyId, index === 0, membership.create_time, membership.modify_time]
            )
        }
    }

    for (const relation of userRoles) {
        const roleKeyId = roleKeyMap.get(relation.key_id)
        if (!roleKeyId) throw new Error(`用户角色映射缺失：${relation.key_id}`)
        await connection.execute(`INSERT INTO tb_account_user_role (user_uid, role_key_id, create_time, modify_time) VALUES (?, ?, ?, ?)`, [
            relation.uid,
            roleKeyId,
            relation.create_time,
            relation.modify_time
        ])
    }

    const childParentKeys = new Set(menus.map(menu => menu.pid).filter((value): value is string => Boolean(value)))
    const menuKeyMap = new Map<string, number>()
    const menuPermissionMap = new Map<string, number>()
    const menuVisibleMap = new Map<string, boolean>()
    for (const menu of menus) {
        const parentKeyId = menu.pid ? menuKeyMap.get(menu.pid) : null
        const mappedPath = menu.router ? ROUTE_PATH_MAP.get(menu.router) || menu.router : null
        const type =
            menu.type === 'button' ? 'button' : childParentKeys.has(menu.key_id) || mappedPath === '/finance' ? 'directory' : 'menu'
        const parentVisible = menu.pid ? menuVisibleMap.get(menu.pid) === true : true
        const visible = menu.type === 'button' ? parentVisible : Boolean(mappedPath && VISIBLE_ROUTE_PATHS.has(mappedPath))
        const permissionCode = PERMISSION_CODE_MAP.get(menu.key) || menu.key
        const menuKeyId = await insertAndGetId(
            connection,
            `INSERT INTO tb_account_menu
                (parent_key_id, type, name, route_name, path, component, permission_code, icon, external_url,
                 sort, visible, keep_alive, status, create_time, modify_time)
             VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, NULL, ?, ?, 0, ?, ?, ?)`,
            [
                parentKeyId,
                type,
                menu.name.trim(),
                mappedPath,
                permissionCode,
                menu.icon_name,
                menu.sort,
                visible,
                mapStatus(menu.status),
                menu.create_time,
                menu.modify_time
            ]
        )
        menuKeyMap.set(menu.key_id, menuKeyId)
        menuPermissionMap.set(permissionCode, menuKeyId)
        menuVisibleMap.set(menu.key_id, visible)
    }

    for (const button of EXTRA_PERMISSION_BUTTONS) {
        const parentKeyId = menuPermissionMap.get(button.parentPermission)
        if (!parentKeyId) throw new Error(`权限按钮父菜单不存在：${button.parentPermission}`)
        const keyId = await insertAndGetId(
            connection,
            `INSERT INTO tb_account_menu
                (parent_key_id, type, name, route_name, path, component, permission_code, icon, external_url,
                 sort, visible, keep_alive, status)
             VALUES (?, 'button', ?, NULL, NULL, NULL, ?, NULL, NULL, ?, 1, 0, 'enabled')`,
            [parentKeyId, button.name, button.permissionCode, button.sort]
        )
        menuPermissionMap.set(button.permissionCode, keyId)
    }

    for (const relation of roleMenus) {
        const roleKeyId = roleKeyMap.get(relation.key_id)
        const menuKeyId = menuKeyMap.get(relation.sid)
        if (!roleKeyId || !menuKeyId) throw new Error('角色菜单映射缺失')
        await connection.execute(
            `INSERT IGNORE INTO tb_account_role_menu (role_key_id, menu_key_id, create_time, modify_time) VALUES (?, ?, ?, ?)`,
            [roleKeyId, menuKeyId, relation.create_time, relation.modify_time]
        )
    }

    const financeMenus = await repairFinanceMenus(connection)

    const admin = selectedAdmin[0]
    await connection.execute(`UPDATE tb_account_user SET password = ? WHERE uid = ?`, [
        options.initialAdminPasswordHash || resetRequiredPassword(),
        admin.uid
    ])
    await connection.execute(`INSERT IGNORE INTO tb_account_user_role (user_uid, role_key_id) VALUES (?, ?)`, [
        admin.uid,
        superAdminRoleKeyId
    ])

    const targetCounts: Record<string, number> = {}
    for (const table of [
        'tb_account_user',
        'tb_account_organization',
        'tb_account_organization_closure',
        'tb_account_user_organization',
        'tb_account_role',
        'tb_account_role_data_scope',
        'tb_account_role_data_scope_organization',
        'tb_account_user_role',
        'tb_account_position',
        'tb_account_user_position',
        'tb_account_menu',
        'tb_account_role_menu'
    ]) {
        const rows = await selectRows<RowDataPacket & { row_count: number }>(connection, `SELECT COUNT(*) AS row_count FROM \`${table}\``)
        targetCounts[table] = Number(rows[0].row_count)
    }
    return {
        sourceCounts: {
            users: users.length,
            organizations: organizations.length,
            roles: roles.length,
            menus: menus.length,
            memberships: memberships.length,
            userRoles: userRoles.length,
            roleMenus: roleMenus.length
        },
        targetCounts,
        financeMenus,
        duplicateEmailsResetToNull,
        placeholderAdminUsed: !options.initialAdminAccount
    }
}

async function main(): Promise<void> {
    const options = parseOptions()
    const config = await loadDatabaseConfig()
    const targetDatabase = assertIdentifier(
        process.env.ACCOUNT_MYSQL_DATABASE?.trim() || config.database?.trim() || config.name?.trim() || '',
        '目标数据库名称'
    )
    if (!targetDatabase) throw new Error('目标数据库名称不能为空')
    if (targetDatabase === options.sourceDatabase) throw new Error('旧库和目标库不能相同')

    const connection = await mysql.createConnection({
        host: process.env.ACCOUNT_MYSQL_HOST?.trim() || config.host,
        port: Number(process.env.ACCOUNT_MYSQL_PORT || config.port || 3306),
        user: process.env.ACCOUNT_MYSQL_USERNAME?.trim() || config.username,
        password: process.env.ACCOUNT_MYSQL_PASSWORD ?? config.password,
        database: targetDatabase,
        charset: process.env.ACCOUNT_MYSQL_CHARSET || config.charset || 'utf8mb4',
        timezone: process.env.ACCOUNT_MYSQL_TIMEZONE || config.timezone || '+08:00',
        supportBigNumbers: true,
        bigNumberStrings: true
    })

    try {
        await assertSource(connection, options.sourceDatabase)
        const superAdminRoleKeyId = await assertTarget(connection)
        await connection.beginTransaction()
        try {
            const result = await migrate(connection, options, superAdminRoleKeyId)
            if (options.apply) await connection.commit()
            else await connection.rollback()
            process.stdout.write(`${JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...result }, null, 2)}\n`)
        } catch (error) {
            await connection.rollback()
            throw error
        }
    } finally {
        await connection.end()
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}

export { mapStatus, sortTree }
