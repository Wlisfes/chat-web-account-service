import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { createNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { DatabaseModule } from '@/modules/database/database.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { ConsumerModule } from '@/modules/consumer/consumer.module'
import { MenuModule } from '@/modules/menu/menu.module'
import { HealthModule } from '@/modules/health/health.module'
import { OrganizationModule } from '@/modules/organization/organization.module'
import { PermissionGuard } from '@/modules/permission/permission.guard'
import { PermissionModule } from '@/modules/permission/permission.module'
import { RoleModule } from '@/modules/role/role.module'
import { UserModule } from '@/modules/user/user.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(
            createNacosRuntimeOptions({
                serviceName: 'chat-web-account-service',
                registerPort: process.env.PORT,
                NACOS_SERVER: process.env.NACOS_SERVER,
                NACOS_NAMESPACE: process.env.NACOS_NAMESPACE,
                NACOS_USERNAME: process.env.NACOS_USERNAME,
                NACOS_PASSWORD: process.env.NACOS_PASSWORD,
                NACOS_REQUEST_TIMEOUT: process.env.NACOS_REQUEST_TIMEOUT,
                NACOS_CONFIG_DATA_ID: process.env.NACOS_CONFIG_DATA_ID,
                NACOS_CONFIG_GROUP: process.env.NACOS_CONFIG_GROUP,
                NACOS_REGISTER_ENABLED: process.env.NACOS_REGISTER_ENABLED,
                NACOS_REGISTER_REQUIRED: process.env.NACOS_REGISTER_REQUIRED,
                NACOS_SERVICE_NAME: process.env.NACOS_SERVICE_NAME,
                NACOS_GROUP: process.env.NACOS_GROUP,
                NACOS_REGISTER_IP: process.env.NACOS_REGISTER_IP,
                NACOS_REGISTER_PORT: process.env.NACOS_REGISTER_PORT
            })
        ),
        RedisModule,
        DatabaseModule,
        AuthModule,
        ConsumerModule,
        HealthModule,
        PermissionModule,
        OrganizationModule,
        MenuModule,
        RoleModule,
        UserModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: PermissionGuard }]
})
export class AppModule {}
