import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    await app.listen(3000)

    console.log(
        // `Chat管理平台API服务启动[${process.env.NODE_ENV}]:`,
        `http://localhost:3000`,
        `http://localhost:3000/api/swagger`
    )
}
bootstrap()
