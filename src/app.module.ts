import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { AuthorizationGuard, AuthorizationModule, GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { DatabaseModule } from '@/database/database.module'
import { SheetModule } from '@/modules/sheet/sheet.module'
import { HealthModule } from '@/health/health.module'
import { OrganizationModule } from '@/modules/organization/organization.module'
import { RoleModule } from '@/modules/role/role.module'
import { UserModule } from '@/modules/user/user.module'
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
        OrganizationModule,
        SheetModule,
        RoleModule,
        UserModule,
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
