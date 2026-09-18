const test = require('node:test')
const assert = require('node:assert/strict')
const { grantsAreIsolated } = require('../dist/cli/isolate-service-databases')

test('部署迁移只接受本服务数据库授权', () => {
    assert.equal(
        grantsAreIsolated(
            [
                'GRANT USAGE ON *.* TO `chat_web_account_service`@`%`',
                'GRANT ALL PRIVILEGES ON `chat_web_account`.* TO `chat_web_account_service`@`%`'
            ],
            'chat_web_account'
        ),
        true
    )
    assert.equal(grantsAreIsolated(['GRANT ALL PRIVILEGES ON *.* TO `root`@`%`'], 'chat_web_account'), false)
    assert.equal(grantsAreIsolated(['GRANT SELECT ON `chat_web_finance`.* TO `service`@`%`'], 'chat_web_account'), false)
    assert.equal(
        grantsAreIsolated(['GRANT ALL PRIVILEGES ON `chat-web-account`.* TO `chat_web_account_service`@`%`'], 'chat-web-account'),
        true
    )
})
