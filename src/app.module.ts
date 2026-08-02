import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'
import { NacosModule } from '@/nacos'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        NacosModule,
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
