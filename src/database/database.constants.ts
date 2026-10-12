import { TbTaskCron, TbTaskExecution } from '@wlisfes/chat-web-base-schema/chat-web-task-mysql'

/** Nacos 中 Task 服务 MySQL 配置的根路径。 */
export const TASK_MYSQL_CONFIG_KEY = 'database.chat-web-task'

/** Task 数据库包含的全部 TypeORM 实体。 */
export const TASK_MYSQL_ENTITIES = [TbTaskCron, TbTaskExecution]
