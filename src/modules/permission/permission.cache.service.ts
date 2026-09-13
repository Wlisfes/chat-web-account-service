import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FeignClientAuthManager } from '@wlisfes/chat-web-base-schema/feign'

/** Account 权限数据变更后通知 Auth 清理用户权限缓存。 */
@Injectable()
export class PermissionCacheService {
    private readonly logger = new Logger(PermissionCacheService.name)

    constructor(
        private readonly authClient: FeignClientAuthManager,
        private readonly configService: ConfigService
    ) {}

    /** 缓存通知失败不回滚已经提交的账号事务，由 Auth 的 TTL 负责最终兜底。 */
    public async invalidate(input: { uids?: string[]; roleKeyIds?: number[] }): Promise<void> {
        const token = this.configService.get<string>('gateway.feign.service_token')?.trim()
        if (!token) {
            this.logger.warn('缺少 Auth 权限缓存失效所需的服务间凭据')
            return
        }
        try {
            await this.authClient.invalidatePermissionCache(`Bearer ${token.replace(/^Bearer\s+/i, '')}`, input)
        } catch (error) {
            this.logger.warn(`Auth 权限缓存失效通知失败：${error instanceof Error ? error.message : String(error)}`)
        }
    }
}
