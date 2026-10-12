import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { TASK_MYSQL_CONFIG_KEY, TASK_MYSQL_ENTITIES } from '@/database/database.constants'

/** Task 服务专属 MySQL 连接；配置只从 Nacos `database.chat-web-task` 读取。 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createMysqlOptions(configService, {
                    configKey: TASK_MYSQL_CONFIG_KEY,
                    entities: [...TASK_MYSQL_ENTITIES]
                })
            }
        }),
        TypeOrmModule.forFeature([...TASK_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
