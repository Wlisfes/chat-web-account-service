const test = require('node:test')
const assert = require('node:assert/strict')
const { ConfigService } = require('@nestjs/config')
const { syncFeignConfiguration } = require('../dist/modules/feign/feign-config.module')

test('Account 读取嵌套 Feign 配置并映射共享客户端键', () => {
    const config = new ConfigService({
        feign: {
            'chat-web-finance': { url: 'http://chat-web-finance-service:5030', timeout: 3000 }
        }
    })

    syncFeignConfiguration(config)

    assert.equal(config.get('FINANCE_SERVICE_URL'), 'http://chat-web-finance-service:5030')
    assert.equal(config.get('FINANCE_SERVICE_TIMEOUT_MS'), 3000)
})

test('Account 拒绝不完整的 Feign 服务配置', () => {
    const config = new ConfigService({ feign: { 'chat-web-finance': { url: 'http://chat-web-finance-service:5030' } } })

    assert.throws(() => syncFeignConfiguration(config), /feign\.chat-web-finance\.timeout/)
})

test('Account 的 Nacos Feign 节点移除后清理旧兼容键', () => {
    const config = new ConfigService({ feign: { 'chat-web-finance': { url: 'http://chat-web-finance-service:5030', timeout: 3000 } } })

    syncFeignConfiguration(config)
    config.set('feign', {})
    syncFeignConfiguration(config)

    assert.equal(config.get('FINANCE_SERVICE_URL'), undefined)
    assert.equal(config.get('FINANCE_SERVICE_TIMEOUT_MS'), undefined)
})
