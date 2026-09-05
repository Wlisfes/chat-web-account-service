import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { AuthModule, JwtAuthGuard } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { DatabaseModule } from '@/modules/database/database.module'
import { ConsumerModule } from '@/modules/consumer/consumer.module'
import { SheetModule } from '@/modules/sheet/sheet.module'
import { HealthModule } from '@/modules/health/health.module'
import { DeptModule } from '@/modules/dept/dept.module'
import { PermissionGuard } from '@/modules/permission/permission.guard'
import { PermissionModule } from '@/modules/permission/permission.module'
import { RoleModule } from '@/modules/role/role.module'
import { UserModule } from '@/modules/user/user.module'
import { PositionModule } from '@/modules/position/position.module'
import { FeignModule } from '@/modules/feign/feign.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        HttpResponseModule,
        DatabaseModule,
        // 认证由鉴权服务负责；账号服务只通过内部内省协议校验令牌，不再持有 JWT 密钥和登录会话。
        AuthModule,
        ConsumerModule,
        HealthModule,
        PermissionModule,
        DeptModule,
        SheetModule,
        RoleModule,
        UserModule,
        PositionModule,
        FeignModule
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: PermissionGuard }]
})
export class AppModule {}
