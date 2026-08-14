import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NacosModule } from '@/modules/nacos/nacos.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), NacosModule],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
