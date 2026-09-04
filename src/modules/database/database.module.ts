import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NacosService } from '@wlisfes/chat-web-base-schema/nacos'
import { createMysqlOptions, DataBaseService } from '@wlisfes/chat-web-base-schema/database'
import { ACCOUNT_MYSQL_CONFIG_KEY, ACCOUNT_MYSQL_ENTITIES } from '@/modules/database/database.constants'

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, NacosService],
            useFactory: async (configService: ConfigService, nacosService: NacosService) => {
                await nacosService.loadConfig()
                return createMysqlOptions(configService, {
                    configKey: ACCOUNT_MYSQL_CONFIG_KEY,
                    entities: [...ACCOUNT_MYSQL_ENTITIES]
                })
            }
        }),
        TypeOrmModule.forFeature([...ACCOUNT_MYSQL_ENTITIES])
    ],
    providers: [DataBaseService],
    exports: [TypeOrmModule, DataBaseService]
})
export class DatabaseModule {}
