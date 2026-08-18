import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from 'redis'

@Injectable()
export class RedisService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(RedisService.name)
    private readonly client: ReturnType<typeof createClient>

    constructor(private readonly configService: ConfigService) {
        this.client = createClient({
            url: this.getConnectionUrl(),
            socket: {
                connectTimeout: this.getInteger('REDIS_CONNECT_TIMEOUT_MS', 5000, 100, 60_000),
                reconnectStrategy: retries => Math.min(retries * 200, 3000)
            }
        })
        this.client.on('error', error => this.logger.error(`Redis连接错误：${error instanceof Error ? error.message : String(error)}`))
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.client.connect()
        await this.client.ping()
        this.logger.log('Redis连接已就绪')
    }

    async onApplicationShutdown(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit()
        }
    }

    async ping(): Promise<boolean> {
        return this.client.isReady && (await this.client.ping()) === 'PONG'
    }

    async get(key: string): Promise<string | null> {
        return this.normalizeValue(await this.client.get(key))
    }

    async getDel(key: string): Promise<string | null> {
        return this.normalizeValue(await this.client.getDel(key))
    }

    async setEx(key: string, seconds: number, value: string): Promise<void> {
        await this.client.setEx(key, seconds, value)
    }

    async del(key: string): Promise<void> {
        await this.client.del(key)
    }

    async rotate(oldKey: string, newKey: string, seconds: number, value: string): Promise<void> {
        await this.client.multi().setEx(newKey, seconds, value).del(oldKey).exec()
    }

    private getConnectionUrl(): string {
        const configuredUrl = this.configService.get<string>('REDIS_URL')?.trim()
        if (configuredUrl) {
            let url: URL
            try {
                url = new URL(configuredUrl)
            } catch {
                throw new Error('REDIS_URL 格式无效')
            }
            if (!['redis:', 'rediss:'].includes(url.protocol)) {
                throw new Error('REDIS_URL 必须使用 redis:// 或 rediss://')
            }
            return configuredUrl
        }

        const host = this.configService.get<string>('REDIS_HOST')?.trim() || 'chat-web-redis'
        const port = this.getInteger('REDIS_PORT', 6379, 1, 65_535)
        const database = this.getInteger('REDIS_DATABASE', 0, 0, 15)
        const username = this.configService.get<string>('REDIS_USERNAME')?.trim()
        const password = this.configService.get<string>('REDIS_PASSWORD')
        const credentials = password
            ? `${username ? encodeURIComponent(username) : ''}:${encodeURIComponent(password)}@`
            : username
              ? `${encodeURIComponent(username)}@`
              : ''
        const protocol = this.configService.get<string>('REDIS_TLS') === 'true' ? 'rediss' : 'redis'
        return `${protocol}://${credentials}${host}:${port}/${database}`
    }

    private normalizeValue(value: string | Buffer | null): string | null {
        return Buffer.isBuffer(value) ? value.toString('utf8') : value
    }

    private getInteger(key: string, fallback: number, minimum: number, maximum: number): number {
        const configured = this.configService.get<string | number>(key)
        const value = configured === undefined || configured === null || configured === '' ? fallback : Number(configured)
        if (!Number.isInteger(value) || value < minimum || value > maximum) {
            throw new Error(`${key} 必须是 ${minimum}-${maximum} 之间的整数`)
        }
        return value
    }
}
