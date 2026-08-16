import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '@/modules/database/database.module'
import { NacosModule } from '@/modules/nacos/nacos.module'
import { AppController } from '@/app.controller'
import { AppService } from '@/app.service'

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), NacosModule.forRoot(), DatabaseModule],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
