const test = require('node:test')
const assert = require('node:assert/strict')

const { SheetService } = require('../dist/modules/sheet/sheet.service')
const {
    TbAccountMenuStatusDefinition,
    TbAccountMenuTypeDefinition,
    TbAccountMenuVisibleDefinition
} = require('@wlisfes/chat-web-base-schema/chat-web-account-mysql')

test('菜单枚举接口直接返回 schema 定义的选项', async () => {
    const service = new SheetService({}, {}, {}, {})
    const result = await service.httpBaseAccountSheetEnums()

    assert.deepEqual(result, {
        type: TbAccountMenuTypeDefinition.options,
        status: TbAccountMenuStatusDefinition.options,
        visible: TbAccountMenuVisibleDefinition.options
    })
})
