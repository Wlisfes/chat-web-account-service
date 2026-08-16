import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { setupSwagger } from '@wlisfes/chat-web-base-schema'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule)
    const port = Number(process.env.PORT ?? app.get(ConfigService).get<number>('server.port', 3000))
    return await setupSwagger(app, {
        title: `Chat Web 账号服务 API`,
        description: `Chat Web 账号、用户及身份信息管理接口文档`,
        port: port
    }).then(() => {
        console.log(`Chat Web 账号服务启动[${process.env.NODE_ENV}]:`, `http://127.0.0.1:${port}`, `http://127.0.0.1:${port}/api/swagger`)
    })
}
bootstrap()
