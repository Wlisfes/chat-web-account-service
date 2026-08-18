import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class HttpResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle()
        }
        const response = context.switchToHttp().getResponse()
        if (response.headersSent || response.getHeader('Content-Type')) {
            return next.handle()
        }
        return next.handle().pipe(
            map(data => ({
                data: data ?? null,
                code: 200,
                message: 'success',
                timestamp: new Date().toISOString()
            }))
        )
    }
}
