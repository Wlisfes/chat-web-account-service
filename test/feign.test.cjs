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
            async httpBaseAccountColumnUserResolver(input) {
                return users.filter(user => input.uids.includes(user.uid))
            }
        }),
        config({ 'gateway.feign.service_token': 'service-token' })
    )

    assert.equal(FeignController.prototype.introspect, undefined)
    assert.equal(FeignController.prototype.httpBaseCrmConsumerResolver, undefined)
    assert.equal(FeignController.prototype.httpBaseAccountBatchUserResolver, undefined)
    assert.deepEqual(await controller.httpBaseAccountColumnUserResolver('Bearer service-token', { uids: ['2149446185344106496'] }), users)
    assert.deepEqual(await controller.httpBaseAccountUserResolver('Bearer service-token', { uid: '2149446185344106496' }), users[0])
    await assert.rejects(
        () => controller.httpBaseAccountUserResolver('Bearer service-token', { uid: '2149446185344106497' }),
        error => error?.status === 404
    )
    await assert.rejects(
        () => controller.httpBaseAccountUserResolver('Bearer service-token', { uid: 'missing' }),
        error => error?.status === 400
    )
    await assert.rejects(
        () => controller.httpBaseAccountColumnUserResolver('Bearer user-token', { uids: ['2149446185344106496'] }),
        error => error?.status === 401
    )
    await assert.rejects(
        () => controller.httpBaseAccountUserResolver('Bearer user-token', { uid: '2149446185344106496' }),
        error => error?.status === 401
    )
})
