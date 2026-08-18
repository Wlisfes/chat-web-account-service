import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { moment } from '@wlisfes/chat-web-base-schema'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp()
        const request = context.getRequest<{ originalUrl?: string; url?: string }>()
        const response = context.getResponse()
        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
        const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined
        const responseMessage =
            typeof exceptionResponse === 'object' && exceptionResponse ? (exceptionResponse as { message?: unknown }).message : undefined
        const message = Array.isArray(responseMessage)
            ? String(responseMessage[0] ?? '请求参数错误')
            : typeof responseMessage === 'string'
              ? responseMessage
              : status >= HttpStatus.INTERNAL_SERVER_ERROR
                ? '服务器内部错误'
                : exception instanceof Error
                  ? exception.message
                  : '请求处理失败'

        const requestPath = (request.originalUrl ?? request.url ?? '/').split('?')[0]
        const transportStatus = requestPath === '/health' || requestPath.startsWith('/health/') ? status : HttpStatus.OK
        response.status(transportStatus).json({
            data: null,
            code: status,
            message,
            timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
        })
    }
}
