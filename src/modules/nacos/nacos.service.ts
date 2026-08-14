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

        // 应用启动时读取远程配置，并将配置项写入 ConfigService。
        const content = await this.nacosService.getConfig(dataId, group)

        this.applyRemoteConfig(content, '已加载', dataId, group, namespace)

        // 监听 Nacos 配置变更，配置更新后同步刷新 ConfigService。
        this.nacosService.subscribeConfig(dataId, group, nextContent => {
            try {
                this.applyRemoteConfig(nextContent, '已更新', dataId, group, namespace)
            } catch (error) {
                this.logger.error(`无效的 Nacos 配置更新已被拒绝：${this.getErrorMessage(error)}`)
            }
        })
    }

    private applyRemoteConfig(content: string, action: '已加载' | '已更新', dataId: string, group: string, namespace: string): void {
        if (!content?.trim()) {
            throw new Error(`Nacos 配置为空或不存在：dataId=${dataId}, group=${group}, namespace=${namespace}`)
        }

        if (content === this.currentContent) {
            return
        }

        const parsed = yaml.load(content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Nacos 配置根节点必须是 YAML 对象')
        }

        const config = parsed as Record<string, unknown>
        // 清除新配置中已经不存在的旧配置项。
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
            `Nacos 配置${action}：dataId=${dataId}, group=${group}, namespace=${namespace}, 配置项=${Object.keys(config).join(',')}`
        )

        // 只在非生产环境输出完整配置内容，避免生产日志泄露配置信息。
        if (process.env.NODE_ENV !== 'production') {
            this.logger.log(`Nacos 配置内容：\n${content}`)
        }
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
