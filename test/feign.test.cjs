const test = require('node:test')
const assert = require('node:assert/strict')
const { FeignController } = require('../dist/feign/feign.controller')
const { FeignService } = require('../dist/feign/feign.service')

function config(values) {
    return {
        get(key, fallback) {
            return values[key] ?? fallback
        }
    }
}

test('业务 Feign 不再暴露客户和内省接口，且只接受服务间凭据', async () => {
    const users = [{ uid: '2149446185344106496', number: 'A1', name: '张三' }]
    const controller = new FeignController(
        new FeignService({
            async httpBaseAccountBatchResolverUser(input) {
                assert.deepEqual(input, { uids: ['2149446185344106496'] })
                return users
            }
        }),
        config({ 'gateway.feign.service_token': 'service-token' })
    )

    assert.equal(FeignController.prototype.introspect, undefined)
    assert.equal(FeignController.prototype.httpBaseCrmConsumerResolver, undefined)
    assert.deepEqual(await controller.httpBaseAccountBatchUserResolver('Bearer service-token', { uids: ['2149446185344106496'] }), users)
    await assert.rejects(
        () => controller.httpBaseAccountBatchUserResolver('Bearer user-token', { uids: ['2149446185344106496'] }),
        error => error?.status === 401
    )
})
