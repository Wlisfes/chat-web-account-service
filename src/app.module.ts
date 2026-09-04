import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RedisModule } from '@wlisfes/chat-web-base-schema/redis'
import { DatabaseModule } from '@/modules/database/database.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { ConsumerModule } from '@/modules/consumer/consumer.module'
import { SheetModule } from '@/modules/sheet/sheet.module'
import { HealthModule } from '@/modules/health/health.module'
import { DeptModule } from '@/modules/dept/dept.module'
import { PermissionGuard } from '@/modules/permission/permission.guard'
import { PermissionModule } from '@/modules/permission/permission.module'
import { RoleModule } from '@/modules/role/role.module'
import { UserModule } from '@/modules/user/user.module'
import { PositionModule } from '@/modules/position/position.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        RedisModule.forRoot({ database: 0 }),
        HttpResponseModule,
        DatabaseModule,
        AuthModule,
        ConsumerModule,
        HealthModule,
        PermissionModule,
        DeptModule,
        SheetModule,
        RoleModule,
        UserModule,
        PositionModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: PermissionGuard }]
})
export class AppModule {}
