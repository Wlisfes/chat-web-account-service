import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NacosService } from '@/nacos/nacos.service'

@Module({
    imports: [ConfigModule],
    providers: [NacosService],
    exports: [NacosService],
})
export class NacosModule {}
