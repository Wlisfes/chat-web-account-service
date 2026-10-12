import { Logger, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { GatewayPrincipalGuard, GatewayPrincipalModule } from '@wlisfes/chat-web-base-schema/auth'
import { HttpResponseModule } from '@wlisfes/chat-web-base-schema/interceptor'
import { forRootNacosRuntimeOptions, NacosModule } from '@wlisfes/chat-web-base-schema/nacos'
import { RabbitmqModule } from '@wlisfes/chat-web-base-schema/rabbitmq'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { DatabaseModule } from '@/database/database.module'
import { FeignModule } from '@/feign/feign.module'
import { TASK_RABBITMQ_VHOST } from '@/modules/cron/cron.constants'
import { setupTaskTopology } from '@/modules/cron/cron.topology'
import { CronModule } from '@/modules/cron/cron.module'

/**
 * Task 服务根模块。
 *
 * 全局默认要求网关身份上下文；除首页和存活检查外，业务接口只有继承共享客户端的 /feign/task 服务间接口，
 * 由服务间凭据校验，不接入用户登录与按钮权限（权限在 Skyline 校验）。
 */
@Module({
    imports: [
        HttpResponseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule.forRoot(forRootNacosRuntimeOptions(process.env)),
        GatewayPrincipalModule,
        DatabaseModule,
        RabbitmqModule.forRoot({ vhost: TASK_RABBITMQ_VHOST, setup: setupTaskTopology }),
        CronModule,
        FeignModule
    ],
    controllers: [AppController],
    providers: [Logger, AppService, { provide: APP_GUARD, useExisting: GatewayPrincipalGuard }]
})
export class AppModule {}
