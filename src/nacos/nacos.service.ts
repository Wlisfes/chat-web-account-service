import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as os from 'os'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NacosNamingClient } = require('nacos')

@Injectable()
export class NacosService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NacosService.name)
    private namingClient: any
    private readonly serviceName: string
    private readonly servicePort: number
    private readonly namespace: string
    private readonly groupName: string
    private registered = false

    constructor(private readonly configService: ConfigService) {
        this.serviceName = this.configService.get<string>('NACOS_SERVICE_NAME', 'chat-web-account-service')
        this.servicePort = this.configService.get<number>('PORT', 3000)
        this.namespace = this.configService.get<string>('NACOS_NAMESPACE', 'public')
        this.groupName = this.configService.get<string>('NACOS_GROUP', 'DEFAULT_GROUP')
    }

    async onModuleInit() {
        const serverAddr = this.configService.get<string>('NACOS_SERVER', 'localhost:8848')
        
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
        if (this.registered && this.namingClient) {
            const ip = this.getLocalIP()
            await this.namingClient.deregisterInstance(this.serviceName, ip, this.servicePort, this.groupName)
            this.logger.log(`Service deregistered from Nacos: ${this.serviceName}@${ip}:${this.servicePort}`)
        }
        if (this.namingClient && typeof this.namingClient.close === 'function') {
            await this.namingClient.close()
        }
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
