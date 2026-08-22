import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { createRequestLoggingMiddleware } from '@wlisfes/chat-web-base-schema/logging'
import { requestContextMiddleware } from '@wlisfes/chat-web-base-schema/request-context'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule)
    const logger = new Logger('Bootstrap')
    app.enableShutdownHooks()
    app.use(requestContextMiddleware)
    app.use(createRequestLoggingMiddleware({ serviceName: 'chat-web-account-service' }))
    const port = Number(process.env.PORT ?? app.get(ConfigService).get<number>('server.port', 3000))
    await setupSwagger(app, {
        title: `Chat Web 账号服务 API`,
        description: `Chat Web 账号、用户及身份信息管理接口文档`,
        port: port
    })

    logger.log(`Chat Web 账号服务启动[${process.env.NODE_ENV}]：http://127.0.0.1:${port}`)
    logger.log(`Swagger 文档：http://127.0.0.1:${port}/api/swagger`)
}

void bootstrap().catch(error => {
    const logger = new Logger('Bootstrap')
    logger.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
})
