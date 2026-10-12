const test = require('node:test')
const assert = require('node:assert/strict')
const { AppController } = require('../dist/app.controller')
const { AppService } = require('../dist/app.service')

test('首页和存活检查只返回固定内容，不返回业务数据', async () => {
    const controller = new AppController(new AppService())
    assert.equal(await controller.httpBaseTaskWelcome(), 'Hello World!')
    assert.deepEqual(await controller.httpBaseTaskLiveness(), { status: 'UP' })
})
