import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { moment } from '@wlisfes/chat-web-base-schema'

interface ResponseEnvelope {
    data: unknown
    code: number
    message: string
    timestamp: string
}

function isResponseEnvelope(data: unknown): data is ResponseEnvelope {
    return (
        typeof data === 'object' &&
        data !== null &&
        'data' in data &&
        'code' in data &&
        typeof data.code === 'number' &&
        'message' in data &&
        typeof data.message === 'string' &&
        'timestamp' in data &&
        typeof data.timestamp === 'string'
    )
}

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
            map(data => {
                if (isResponseEnvelope(data)) {
                    return data
                }
                const message =
                    typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
                        ? data.message
                        : 'success'
                return {
                    data: data ?? null,
                    code: 200,
                    message,
                    timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
                }
            })
        )
    }
}
