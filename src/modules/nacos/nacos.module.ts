import { Module, Global } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NacosModule as NestNacosModule } from '@sch_cat/nest-nacos-config'
import { NacosService } from '@/modules/nacos/nacos.service'

@Global()
@Module({
    imports: [ConfigModule, NestNacosModule.forRoot({ serverAddr: process.env.NACOS_SERVER || '127.0.0.1:8848' })],
    providers: [NacosService],
    exports: [NacosService]
})
export class NacosModule {}
