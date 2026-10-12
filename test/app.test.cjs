const test = require('node:test')
const assert = require('node:assert/strict')
const { AppController } = require('../dist/app.controller')
const { AppService } = require('../dist/app.service')

test('默认接口返回服务问候语', () => {
    const controller = new AppController(new AppService())
    assert.equal(controller.getHello(), 'Hello World!')
})
