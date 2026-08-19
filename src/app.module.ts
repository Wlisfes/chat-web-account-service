import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { DatabaseModule } from '@/modules/database/database.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { MenusModule } from '@/modules/menus/menus.module'
import { HealthModule } from '@/modules/health/health.module'
import { OrganizationsModule } from '@/modules/organizations/organizations.module'
import { PermissionGuard } from '@/modules/permissions/permission.guard'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { RolesModule } from '@/modules/roles/roles.module'
import { UsersModule } from '@/modules/users/users.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot({ serviceName: 'chat-web-account-service', defaultPort: 3000 }),
        RedisModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        PermissionsModule,
        OrganizationsModule,
        MenusModule,
        RolesModule,
        UsersModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: PermissionGuard }]
})
export class AppModule {}
