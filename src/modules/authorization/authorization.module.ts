import { Global, Module } from '@nestjs/common'
import { AuthorizationGuard } from '@/modules/authorization/authorization.guard'
import { AuthorizationService } from '@/modules/authorization/authorization.service'

/** Account 权限调用适配模块；权限计算统一由 Auth 服务负责。 */
@Global()
@Module({ providers: [AuthorizationService, AuthorizationGuard], exports: [AuthorizationService, AuthorizationGuard] })
export class AuthorizationModule {}
