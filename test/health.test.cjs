const test = require('node:test')
const assert = require('node:assert/strict')
const { BadRequestException } = require('@nestjs/common')
const { HttpExceptionFilter, PreserveHttpStatus } = require('@wlisfes/chat-web-base-schema/filters')
const { HealthService } = require('../dist/health/health.service')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

test('就绪检查会报告缺失的数据库表', async () => {
    const service = new HealthService(
        {
            isInitialized: true,
            entityMetadatas: [{ tableName: 'table_a' }, { tableName: 'table_b' }],
            async query() {
                return [{ tableName: 'table_a' }]
            }
        },
        config({ 'gateway.feign.service_token': 'service-token' })
    )
    const result = await service.getReadiness()
    assert.equal(result.status, 'DOWN')
    assert.deepEqual(result.database.missingTables, ['table_b'])
})

test('就绪检查会拒绝缺失的 Feign 服务凭据', async () => {
    const dataSource = {
        isInitialized: true,
        entityMetadatas: [{ tableName: 'table_a' }],
        async query() {
            return [{ tableName: 'table_a' }]
        }
    }
    const missing = await new HealthService(dataSource, config({})).getReadiness()
    const valid = await new HealthService(dataSource, config({ 'gateway.feign.service_token': 'service-token' })).getReadiness()

    assert.equal(missing.status, 'DOWN')
    assert.equal(missing.security.authConfigured, false)
    assert.equal(valid.status, 'UP')
    assert.equal(valid.security.authConfigured, true)
})

test('健康检查异常保留原生 HTTP 状态', () => {
    const response = {
        statusCode: undefined,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value
        },
        status(code) {
            this.statusCode = code
            return this
        },
        json() {}
    }
    const healthHandler = () => undefined
    PreserveHttpStatus()(healthHandler)
    const host = {
        getHandler() {
            return healthHandler
        },
        getClass() {
            return class HealthController {}
        },
        switchToHttp() {
            return {
                getRequest() {
                    return { originalUrl: '/health/ready' }
                },
                getResponse() {
                    return response
                }
            }
        }
    }

    new HttpExceptionFilter().catch(new BadRequestException('健康检查失败'), host)
    assert.equal(response.statusCode, 400)
})
