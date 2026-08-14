import { Module, Global } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NacosModule as NestNacosModule } from '@sch_cat/nest-nacos-config'
import { NacosService } from '@/modules/nacos/nacos.service'

console.log({ serverAddr: process.env.NACOS_SERVER, namespace: process.env.NACOS_NAMESPACE })
@Global()
@Module({
    imports: [
        ConfigModule,
        NestNacosModule.forRoot({
            serverAddr: process.env.NACOS_SERVER,
            namespace: process.env.NACOS_NAMESPACE,
            requestTimeout: 5000
        })
    ],
    providers: [NacosService],
    exports: [NacosService]
})
export class NacosModule {}
