const test = require('node:test')
const assert = require('node:assert/strict')

const { InternalAuthGuard } = require('../dist/modules/auth/internal-auth.guard')

function createContext(value) {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ header: name => (name === 'x-service-token' ? value : undefined) })
        })
    }
}

test('内部认证 Guard 启动时要求 Nacos 服务凭据', () => {
    const guard = new InternalAuthGuard({ get: () => undefined })
    assert.throws(() => guard.onApplicationBootstrap(), /feign\.service_token/)
})

test('内部认证 Guard 使用固定时间比较校验服务凭据', () => {
    const guard = new InternalAuthGuard({ get: () => 'internal-token' })
    guard.onApplicationBootstrap()
    assert.equal(guard.canActivate(createContext('internal-token')), true)
    assert.throws(
        () => guard.canActivate(createContext('wrong-token')),
        error => error?.status === 401
    )
})
