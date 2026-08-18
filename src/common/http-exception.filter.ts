import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp()
        const request = context.getRequest()
        const response = context.getResponse()
        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
        const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined
        const responseMessage = typeof exceptionResponse === 'object' && exceptionResponse ? (exceptionResponse as { message?: unknown }).message : undefined
        const message = Array.isArray(responseMessage)
            ? String(responseMessage[0] ?? '请求参数错误')
            : typeof responseMessage === 'string'
              ? responseMessage
              : exception instanceof Error
                ? exception.message
                : '服务器内部错误'

        response.status(status).json({
            data: null,
            code: status,
            message,
            timestamp: new Date().toISOString(),
            method: request.method,
            url: request.originalUrl || request.url
        })
    }
}
