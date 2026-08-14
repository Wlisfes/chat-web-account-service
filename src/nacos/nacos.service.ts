import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as os from 'os'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NacosConfigClient, NacosNamingClient } = require('nacos')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml')

@Injectable()
export class NacosService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NacosService.name)
    private configClient: any
    private namingClient: any
    private readonly serviceName: string
    private readonly namespace: string
    private readonly groupName: string
    private readonly configDataId: string
    private readonly configGroup: string
    private servicePort = 3000
    private registered = false
    private remoteConfigKeys = new Set<string>()
    private readonly configListener = (content: string) => {
        try {
            this.applyRemoteConfig(content, 'updated')
        } catch (error) {
            this.logger.error(
                `Rejected invalid Nacos config update: ${this.getErrorMessage(error)}`,
            )
        }
    }

    constructor(private readonly configService: ConfigService) {
        this.serviceName = this.configService.get<string>('NACOS_SERVICE_NAME', 'chat-web-account-service')
        this.namespace = this.configService.get<string>('NACOS_NAMESPACE', 'public')
        this.groupName = this.configService.get<string>('NACOS_GROUP', 'DEFAULT_GROUP')
        this.configDataId = this.configService.get<string>(
            'NACOS_CONFIG_DATA_ID',
            'chat-web-account-service.yaml',
        )
        this.configGroup = this.configService.get<string>(
            'NACOS_CONFIG_GROUP',
            this.groupName,
        )
    }

    async onModuleInit() {
        const serverAddr = this.configService.get<string>('NACOS_SERVER', 'localhost:8848')

        await this.initializeConfigClient(serverAddr)
        this.servicePort = Number(
            process.env.PORT ?? this.configService.get<number>('server.port', 3000),
        )
        if (!Number.isInteger(this.servicePort) || this.servicePort < 1 || this.servicePort > 65535) {
            throw new Error(`Invalid service port: ${this.servicePort}`)
        }

        this.namingClient = new NacosNamingClient({
            logger: console,
            serverList: serverAddr,
            namespace: this.namespace,
        })

        await this.namingClient.ready()
        this.logger.log(`Nacos naming client ready, server: ${serverAddr}`)

        const ip = this.getLocalIP()
        await this.namingClient.registerInstance(this.serviceName, {
            ip,
            port: this.servicePort,
            groupName: this.groupName,
            metadata: {
                version: '1.0.0',
                protocol: 'http',
                region: 'default',
            },
            healthy: true,
            enabled: true,
            weight: 1,
        })

        this.registered = true
        this.logger.log(`Service registered to Nacos: ${this.serviceName}@${ip}:${this.servicePort}`)
    }

    async onModuleDestroy() {
        if (this.configClient) {
            this.configClient.unSubscribe(
                { dataId: this.configDataId, group: this.configGroup },
                this.configListener,
            )
            this.configClient.close()
        }
        if (this.registered && this.namingClient) {
            const ip = this.getLocalIP()
            await this.namingClient.deregisterInstance(this.serviceName, ip, this.servicePort, this.groupName)
            this.logger.log(`Service deregistered from Nacos: ${this.serviceName}@${ip}:${this.servicePort}`)
        }
        if (this.namingClient && typeof this.namingClient.close === 'function') {
            await this.namingClient.close()
        }
    }

    private async initializeConfigClient(serverAddr: string) {
        this.configClient = new NacosConfigClient({
            serverAddr,
            namespace: this.namespace,
            requestTimeout: 5000,
        })

        const content = await this.configClient.getConfig(
            this.configDataId,
            this.configGroup,
        )
        this.applyRemoteConfig(content, 'loaded')
        this.configClient.subscribe(
            { dataId: this.configDataId, group: this.configGroup },
            this.configListener,
        )
    }

    private applyRemoteConfig(content: string, action: 'loaded' | 'updated') {
        if (!content?.trim()) {
            throw new Error(
                `configuration ${this.configDataId}@${this.configGroup} is empty or missing`,
            )
        }

        const parsed = yaml.load(content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('configuration root must be a YAML object')
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
        this.remoteConfigKeys = new Set(Object.keys(config))

        this.logger.log(
            `Nacos config ${action}: ${this.configDataId}@${this.configGroup}, namespace=${this.namespace}, keys=${Object.keys(config).join(',')}`,
        )
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private getLocalIP(): string {
        const interfaces = os.networkInterfaces()
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]!) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address
                }
            }
        }
        return '127.0.0.1'
    }

    getNamingClient(): any {
        return this.namingClient
    }
}
