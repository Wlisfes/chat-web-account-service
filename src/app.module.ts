import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { DatabaseModule } from '@/modules/database/database.module'
import { SheetModule } from '@/modules/sheet/sheet.module'
import { HealthModule } from '@/modules/health/health.module'
import { DeptModule } from '@/modules/dept/dept.module'
import { RoleModule } from '@/modules/role/role.module'
import { UserModule } from '@/modules/user/user.module'
import { PositionModule } from '@/modules/position/position.module'
import { FeignModule } from '@/feign/feign.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        HttpResponseModule,
        DatabaseModule,
        GatewayPrincipalModule,
        HealthModule,
        AuthorizationModule,
        DeptModule,
        SheetModule,
        RoleModule,
        UserModule,
        PositionModule,
        FeignModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useExisting: GatewayPrincipalGuard },
        { provide: APP_GUARD, useExisting: AuthorizationGuard }
    ]
})
export class AppModule {}
