import {
    TbAccountConsumer,
    TbAccountMenu,
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountRole,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountRoleMenu,
    TbAccountUser,
    TbAccountUserOrganization,
    TbAccountUserRole,
    TbAccountPosition,
    TbAccountUserPosition
} from '@wlisfes/chat-web-base-schema/chat-web-account-mysql'

/** Nacos 中账号服务 MySQL 配置的根路径。 */
export const ACCOUNT_MYSQL_CONFIG_KEY = 'database.chat-web-account'

/** 当前账号数据库包含的全部 TypeORM 实体。 */
export const ACCOUNT_MYSQL_ENTITIES = [
    TbAccountUser,
    TbAccountConsumer,
    TbAccountOrganization,
    TbAccountOrganizationClosure,
    TbAccountUserOrganization,
    TbAccountMenu,
    TbAccountRole,
    TbAccountUserRole,
    TbAccountRoleMenu,
    TbAccountRoleDataScope,
    TbAccountRoleDataScopeOrganization,
    TbAccountPosition,
    TbAccountUserPosition
]
