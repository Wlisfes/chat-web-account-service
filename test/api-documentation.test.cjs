const test = require('node:test')
const assert = require('node:assert/strict')
require('reflect-metadata')

const { Module } = require('@nestjs/common')
const { NestFactory } = require('@nestjs/core')
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger')

const controllers = [
    require('../dist/app.controller').AppController,
    require('../dist/modules/auth/auth.controller').AuthController,
    require('../dist/modules/consumer/consumer.controller').ConsumerController,
    require('../dist/modules/sheet/sheet.controller').SheetController,
    require('../dist/modules/dept/dept.controller').DeptController,
    require('../dist/modules/permission/permission.controller').PermissionController,
    require('../dist/modules/position/position.controller').PositionController,
    require('../dist/modules/role/role.controller').RoleController,
    require('../dist/modules/user/user.controller').UserController
]

function assertTypedSchema(schema, label) {
    assert.ok(schema, `${label} 缺少 Schema`)
    if (schema.$ref || schema.oneOf || schema.anyOf) return
    if (schema.allOf) {
        assert.ok(schema.allOf.length > 0, `${label} 的 allOf 不能为空`)
        return
    }
    assert.ok(schema.type || schema.properties, `${label} 缺少字段类型`)
    if (schema.type === 'array') assertTypedSchema(schema.items, `${label}[]`)
    if (schema.type === 'object' && !schema.properties && !schema.additionalProperties) {
        assert.fail(`${label} 不能是无字段定义的 object`)
    }
}

async function createDocument() {
    const dependencies = [...new Set(controllers.flatMap(controller => Reflect.getMetadata('design:paramtypes', controller) ?? []))]
    class DocumentationModule {}
    Module({
        controllers,
        providers: dependencies.map(provide => ({ provide, useValue: {} }))
    })(DocumentationModule)
    const app = await NestFactory.create(DocumentationModule, { logger: false })
    const config = new DocumentBuilder().addBearerAuth({ type: 'apiKey', in: 'header', name: 'authorization' }, 'authorization').build()
    const document = SwaggerModule.createDocument(app, config)
    await app.close()
    return document
}

test('OpenAPI 请求和响应包含完整字段类型与示例', async () => {
    const document = await createDocument()
    for (const schemaName of ['UserPageResponseDto', 'SheetPageResponseDto', 'ConsumerPageResponseDto', 'PositionPageResponseDto']) {
        const properties = document.components.schemas?.[schemaName]?.properties ?? {}
        assert.deepEqual(Object.keys(properties).sort(), ['list', 'page', 'size', 'total'])
        assert.equal(properties.pageSize, undefined, `${schemaName} 不能保留 pageSize`)
        assert.equal(properties.items, undefined, `${schemaName} 不能保留 items`)
    }
    const userQueryProperties = document.components.schemas?.UserQueryDto?.properties ?? {}
    assert.ok(userQueryProperties.vague, 'UserQueryDto 必须提供 vague 模糊查询字段')
    assert.equal(userQueryProperties.keyword, undefined, 'UserQueryDto 不能保留 keyword 字段')

    const operations = Object.entries(document.paths).flatMap(([path, pathItem]) =>
        Object.entries(pathItem)
            .filter(([, operation]) => operation?.responses)
            .map(([method, operation]) => ({ path, method, operation }))
    )

    assert.ok(document.paths['/sheet/tree/structure'], '菜单管理接口必须使用 /sheet 路由前缀')
    assert.ok(document.paths['/dept/tree/structure'], '部门组织接口必须使用 /dept 路由前缀')
    assert.equal(document.paths['/menu/tree/structure'], undefined, '菜单管理不能保留 /menu 路由前缀')
    assert.equal(document.paths['/organization/tree/structure'], undefined, '部门组织不能保留 /organization 路由前缀')

    assert.equal(operations.length, 49)
    assert.equal(operations.filter(({ operation }) => operation.requestBody).length, 27)
    assert.equal(operations.flatMap(({ operation }) => operation.parameters ?? []).filter(parameter => parameter.in === 'query').length, 11)

    for (const { path, method, operation } of operations) {
        const operationLabel = `${method.toUpperCase()} ${path}`
        assert.ok(operation.summary, `${operationLabel} 缺少接口摘要`)
        for (const [status, response] of Object.entries(operation.responses)) {
            const contents = Object.entries(response.content ?? {})
            assert.ok(contents.length > 0, `${operationLabel} ${status} 缺少响应内容`)
            for (const [contentType, media] of contents) {
                assertTypedSchema(media.schema, `${operationLabel} ${status} ${contentType}`)
                assert.notEqual(media.example, undefined, `${operationLabel} ${status} ${contentType} 缺少响应示例`)
                if (contentType === 'application/json' && status !== '302') {
                    assert.equal(media.schema.allOf?.length, 2, `${operationLabel} 必须使用 Knife4j 可展开的 allOf 响应`)
                    assert.match(media.schema.allOf[0].$ref, /\/ApiResponseDocumentDto$/, `${operationLabel} 缺少统一响应模型`)
                    const dataSchema = media.schema.allOf[1].properties?.data
                    assertTypedSchema(dataSchema, `${operationLabel} data`)
                    assert.deepEqual(media.schema.example, media.example, `${operationLabel} Schema 和媒体响应示例不一致`)
                    assert.equal(media.example.code, 200, `${operationLabel} 响应示例缺少业务状态码`)
                    assert.notEqual(media.example.data, undefined, `${operationLabel} 响应示例缺少 data`)
                }
            }
        }

        if (operation.requestBody) {
            const requestSchema = operation.requestBody.content?.['application/json']?.schema
            assertTypedSchema(requestSchema, `${operationLabel} requestBody`)
            const schemaName = requestSchema.$ref?.split('/').at(-1)
            const schema = schemaName ? document.components.schemas?.[schemaName] : undefined
            assert.ok(schema, `${operationLabel} 请求 DTO 未注册`)
            for (const [propertyName, property] of Object.entries(schema.properties ?? {})) {
                assert.notEqual(property.readOnly, true, `${operationLabel}.${propertyName} 不能是只读入参`)
                assertTypedSchema(property, `${operationLabel}.${propertyName}`)
            }
        }

        for (const parameter of operation.parameters ?? []) {
            if (parameter.in !== 'query') continue
            assert.notEqual(parameter.schema?.readOnly, true, `${operationLabel}.${parameter.name} 不能是只读入参`)
            assertTypedSchema(parameter.schema ?? parameter, `${operationLabel}.${parameter.name}`)
        }
    }

    for (const [schemaName, schema] of Object.entries(document.components.schemas ?? {})) {
        for (const [propertyName, property] of Object.entries(schema.properties ?? {})) {
            if (schemaName === 'ApiResponseDocumentDto' && propertyName === 'data') continue
            assertTypedSchema(property, `${schemaName}.${propertyName}`)
            if (
                ['string', 'number', 'integer', 'boolean'].includes(property.type) &&
                property.example === undefined &&
                property.default === undefined &&
                property.enum === undefined
            ) {
                assert.fail(`${schemaName}.${propertyName} 缺少字段示例`)
            }
        }
    }
})
