import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NacosService as NestNacosService } from '@sch_cat/nest-nacos-config'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml')

@Injectable()
export class NacosService implements OnModuleInit {
    private readonly logger = new Logger(NacosService.name)
    private readonly remoteConfigKeys = new Set<string>()
    private currentContent: string | null = null

    constructor(
        private readonly configService: ConfigService,
        private readonly nacosService: NestNacosService
    ) {}

    async onModuleInit(): Promise<void> {
        const dataId = this.configService.get<string>('NACOS_CONFIG_DATA_ID')
        const group = this.configService.get<string>('NACOS_GROUP')
        const namespace = this.configService.get<string>('NACOS_NAMESPACE')

        const content = await this.nacosService.getConfig(dataId, group)
        this.applyRemoteConfig(content, 'loaded', dataId, group, namespace)

        this.nacosService.subscribeConfig(dataId, group, nextContent => {
            try {
                this.applyRemoteConfig(nextContent, 'updated', dataId, group, namespace)
            } catch (error) {
                this.logger.error(`Rejected invalid Nacos config update: ${this.getErrorMessage(error)}`)
            }
        })
    }

    private applyRemoteConfig(content: string, action: 'loaded' | 'updated', dataId: string, group: string, namespace: string): void {
        if (!content?.trim()) {
            throw new Error(`Nacos config is empty or missing: dataId=${dataId}, group=${group}, namespace=${namespace}`)
        }

        if (content === this.currentContent) {
            return
        }

        const parsed = yaml.load(content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Nacos configuration root must be a YAML object')
        }

        const config = parsed as Record<string, unknown>
        for (const key of this.remoteConfigKeys) {
            if (!(key in config)) {
                this.configService.set(key, undefined)
            }
        }
        for (const [key, value] of Object.entries(config)) {
            this.configService.set(key, value)
        }

        this.remoteConfigKeys.clear()
        Object.keys(config).forEach(key => this.remoteConfigKeys.add(key))
        this.currentContent = content

        this.logger.log(
            `Nacos config ${action}: dataId=${dataId}, group=${group}, namespace=${namespace}, keys=${Object.keys(config).join(',')}`
        )

        if (process.env.NODE_ENV !== 'production') {
            this.logger.log(`Nacos config content:\n${content}`)
        }
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
