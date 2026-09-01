const test = require('node:test')
const assert = require('node:assert/strict')

const { TbAccountMenuType } = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')
const { SheetUtilsService } = require('../dist/modules/sheet/sheet.utils.service')

test('父菜单为空时允许菜单创建或移动到顶层', async () => {
    let managerQueryCount = 0
    let builderQueryCount = 0
    const manager = {
        async findOneBy() {
            managerQueryCount += 1
        }
    }
    const database = {
        async builder() {
            builderQueryCount += 1
        }
    }
    const service = new SheetUtilsService({}, database)

    await assert.doesNotReject(() => service.findParentRequired(null, manager))
    await assert.doesNotReject(() => service.findParentRequired(undefined, manager))
    assert.equal(managerQueryCount, 0)
    assert.equal(builderQueryCount, 0)
})

test('按钮节点不能作为父菜单', async () => {
    const parent = { keyId: 1, type: TbAccountMenuType.BUTTON }
    let queryCount = 0
    const manager = {
        async findOneBy() {
            queryCount += 1
            return parent
        }
    }
    const service = new SheetUtilsService({}, {})

    await assert.rejects(() => service.findParentRequired(parent.keyId, manager), /按钮节点不能包含下级菜单/)
    assert.equal(queryCount, 1)
})
