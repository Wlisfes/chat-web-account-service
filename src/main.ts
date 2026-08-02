import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    
    const port = process.env.PORT || 3000
    await app.listen(port, '0.0.0.0')

    console.log(
        `Chat管理平台API服务启动[${process.env.NODE_ENV || 'production'}]:`,
        `http://0.0.0.0:${port}`,
        `http://0.0.0.0:${port}/api/swagger`
    )
}
bootstrap()
