import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NacosService as NestNacosService } from '@sch_cat/nest-nacos-config'

@Injectable()
export class NacosService implements OnModuleInit {
    constructor(
        private readonly configService: ConfigService,
        private readonly nacosService: NestNacosService
    ) {}

    async onModuleInit(): Promise<void> {
        const content = await this.nacosService.getConfig(this.configService.get('NACOS_CONFIG_DATA_ID'))
        console.log(`1111111:`, content, this.configService.get('NACOS_CONFIG_DATA_ID'))

        this.nacosService.subscribeConfig(
            this.configService.get('NACOS_CONFIG_DATA_ID'),
            this.configService.get('NACOS_GROUP'),
            nextContent => {
                console.log('配置已更新：', nextContent)
            }
        )
    }
}
