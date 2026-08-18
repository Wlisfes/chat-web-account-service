import { networkInterfaces } from 'node:os'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NacosService as NestNacosService } from '@sch_cat/nest-nacos-config'
import { NacosNamingClient } from 'nacos'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml')

type RegisteredInstance = {
    ip: string
    port: number
}

type ClosableNacosNamingClient = NacosNamingClient & {
    close: () => Promise<void>
}

@Injectable()
export class NacosService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NacosService.name)
    private readonly remoteConfigKeys = new Set<string>()
    private currentContent: string | null = null
    private loadPromise: Promise<void> | null = null
    private subscribed = false
    private namingClient?: ClosableNacosNamingClient
    private registeredInstance?: RegisteredInstance

    constructor(
        private readonly configService: ConfigService,
        private readonly nacosService: NestNacosService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.loadConfig()
        await this.registerService()
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.namingClient) {
            return
        }

        if (this.registeredInstance) {
            try {
                await this.namingClient.deregisterInstance(
                    this.getServiceName(),
                    {
                        instanceId: '',
                        healthy: true,
                        enabled: true,
                        ephemeral: true,
                        ...this.registeredInstance
                    },
                    this.getDiscoveryGroup()
                )
            } catch (error) {
                this.logger.warn(`注销 Nacos 服务实例失败：${this.getErrorMessage(error)}`)
            }
        }

        await this.namingClient.close()
    }

    /** 确保远程配置在依赖它的异步模块创建连接前完成加载。 */
    async loadConfig(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.initializeConfig().catch(error => {
                this.loadPromise = null
                throw error
            })
        }
        await this.loadPromise
    }

    private async initializeConfig(): Promise<void> {
        const dataId = this.getRequiredConfig('NACOS_CONFIG_DATA_ID')
        const group = this.configService.get<string>('NACOS_CONFIG_GROUP') || this.getRequiredConfig('NACOS_GROUP')
        const namespace = this.configService.get<string>('NACOS_NAMESPACE', 'public')

        // 应用启动时读取远程配置，并将配置项写入 ConfigService。
        const content = await this.nacosService.getConfig(dataId, group)

        this.applyRemoteConfig(content, '已加载', dataId, group, namespace)

        // 监听 Nacos 配置变更，配置更新后同步刷新 ConfigService。
        if (!this.subscribed) {
            this.nacosService.subscribeConfig(dataId, group, nextContent => {
                try {
                    this.applyRemoteConfig(nextContent, '已更新', dataId, group, namespace)
                } catch (error) {
                    this.logger.error(`无效的 Nacos 配置更新已被拒绝：${this.getErrorMessage(error)}`)
                }
            })
            this.subscribed = true
        }
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
        const appliedKeys: string[] = []
        const environmentOverrideKeys: string[] = []
        // 清除新配置中已经不存在的旧配置项。
        for (const key of this.remoteConfigKeys) {
            if (!(key in config)) {
                this.configService.set(key, undefined)
            }
        }
        for (const [key, value] of Object.entries(config)) {
            if (Object.prototype.hasOwnProperty.call(process.env, key)) {
                environmentOverrideKeys.push(key)
                continue
            }
            this.configService.set(key, value)
            appliedKeys.push(key)
        }

        this.remoteConfigKeys.clear()
        appliedKeys.forEach(key => this.remoteConfigKeys.add(key))
        this.currentContent = content

        this.logger.log(
            `Nacos 配置${action}：dataId=${dataId}, group=${group}, namespace=${namespace}, ` +
                `已应用=${appliedKeys.join(',') || '无'}, 环境变量优先=${environmentOverrideKeys.join(',') || '无'}`
        )
    }

    private async registerService(): Promise<void> {
        if (!this.getBooleanConfig('NACOS_REGISTER_ENABLED', true)) {
            this.logger.warn('Nacos 服务注册已关闭')
            return
        }

        try {
            this.namingClient = new NacosNamingClient({
                logger: this.createNacosClientLogger(),
                serverList: this.configService.get<string>('NACOS_SERVER', '127.0.0.1:8848'),
                namespace: this.configService.get<string>('NACOS_NAMESPACE', 'public'),
                username: this.configService.get<string>('NACOS_USERNAME') || undefined,
                password: this.configService.get<string>('NACOS_PASSWORD') || undefined
            }) as ClosableNacosNamingClient
            await this.namingClient.ready()

            const instance = {
                ip: this.resolveRegisterIp(),
                port: this.getRegisterPort()
            }
            await this.namingClient.registerInstance(
                this.getServiceName(),
                {
                    instanceId: '',
                    healthy: true,
                    enabled: true,
                    ephemeral: true,
                    ...instance
                },
                this.getDiscoveryGroup()
            )
            this.registeredInstance = instance
            this.logger.log(`服务已注册到 Nacos：${this.getServiceName()} ${instance.ip}:${instance.port}`)
        } catch (error) {
            this.logger.error(`注册 Nacos 服务实例失败：${this.getErrorMessage(error)}`)
            if (this.getBooleanConfig('NACOS_REGISTER_REQUIRED', false)) {
                throw error
            }
        }
    }

    private resolveRegisterIp(): string {
        const configuredIp = this.configService.get<string>('NACOS_REGISTER_IP')?.trim()
        if (configuredIp) {
            return configuredIp
        }

        for (const addresses of Object.values(networkInterfaces())) {
            const address = addresses?.find(item => item.family === 'IPv4' && !item.internal)
            if (address) {
                return address.address
            }
        }
        return '127.0.0.1'
    }

    private getRegisterPort(): number {
        const value = this.configService.get<string | number>('NACOS_REGISTER_PORT') ?? this.configService.get<number>('server.port', 3000)
        const port = Number(value)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('NACOS_REGISTER_PORT 必须是 1-65535 之间的整数')
        }
        return port
    }

    private getDiscoveryGroup(): string {
        const group = (
            this.configService.get<string>('NACOS_GROUP') ||
            this.configService.get<string>('NACOS_CONFIG_GROUP') ||
            'DEFAULT_GROUP'
        ).trim()
        return group || 'DEFAULT_GROUP'
    }

    private getServiceName(): string {
        return this.configService.get<string>('NACOS_SERVICE_NAME')?.trim() || 'chat-web-account-service'
    }

    private getBooleanConfig(key: string, fallback: boolean): boolean {
        const value = this.configService.get<boolean | string>(key)
        if (value === undefined || value === null || value === '') {
            return fallback
        }
        if (typeof value === 'boolean') {
            return value
        }
        if (value === 'true' || value === 'false') {
            return value === 'true'
        }
        throw new Error(`${key} 必须是 true 或 false`)
    }

    private createNacosClientLogger(): typeof console {
        const clientLogger = Object.create(console) as typeof console
        clientLogger.log = () => undefined
        clientLogger.info = () => undefined
        clientLogger.debug = () => undefined
        return clientLogger
    }

    private getRequiredConfig(key: string): string {
        const value = this.configService.get<string>(key)
        if (!value?.trim()) {
            throw new Error(`缺少环境变量：${key}`)
        }
        return value.trim()
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }
}
