import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    await app.init()

    const configService = app.get(ConfigService)
    const port = Number(process.env.PORT ?? configService.get<number>('server.port', 3000))
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid service port: ${port}`)
    }
    await app.listen(port, '0.0.0.0')

    console.log(
        `Chat管理平台API服务启动[${process.env.NODE_ENV || 'production'}]:`,
        `http://0.0.0.0:${port}`,
        `http://0.0.0.0:${port}/api/swagger`
    )
}
bootstrap()
