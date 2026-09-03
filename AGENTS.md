# Repository instructions

本文件在本仓库内独立生效，不依赖 `F:/chat-web-service/AGENTS.md` 或其他工作区文件。

## 通用工程规则

- 使用 Node.js 22、Yarn 1.22.22、NestJS 11 和 TypeScript；源码使用 UTF-8，Shell、YAML 和 Dockerfile 使用 LF。
- 统一使用 4 空格、无分号、单引号、`printWidth: 140`、无尾随逗号；内部源码统一使用 `@/*` 路径别名。
- 文件名使用小写 kebab-case 和职责后缀；类、接口、枚举使用 PascalCase，变量、函数和实例属性使用 camelCase，常量和注入 Token 使用 UPPER_SNAKE_CASE。
- 日志、校验消息、Swagger 描述和面向维护者的错误信息使用中文，代码标识符使用英文。
- HTTP Controller 只允许 GET、POST；GET 使用 query，POST 使用 body；多选参数必须是数组，禁止使用 `/:uid` 等路径参数。
- 分页接口统一使用 `page`（从 1 开始）和 `size`（默认 50、最大 100）作为入参，响应统一返回 `page`、`size`、`total`、`list`；禁止使用 `pageSize`、`items`、`records` 或 `rows` 作为同义字段。
- 请求日志必须包含 logId、方法、URL、状态码、来源、入参和耗时，并脱敏密码、Token 等敏感字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`；数据库和表结构由外部 Schema SQL 管理。
- Nacos 配置、服务发现、公开路由和跨域白名单统一维护在 Nacos，不在业务代码中硬编码生产配置。
- `.env.example` 只列出启动所需参数和明确占位符；真实密钥、Token、私钥和生产 `.env` 不得提交。
- 涉及容器部署时必须遵守本文件部署章节中的主机、Runner、网络、健康检查和回滚约束，禁止使用 `--remove-orphans`。
- 每次改动至少执行格式检查、TypeScript 类型检查和 Nest 构建；涉及数据库、代理、服务发现或部署时增加运行级验证。

## 单机部署规则

- 本服务只部署到当前主机 `chat-home-server`，原另一台部署机器已废弃并下线，不得再为废弃机器创建部署任务或多机矩阵。
- GitHub Actions 使用 `chat-home-server` Runner 标签和 `production-home` Environment，只构建一次完整 Git SHA 镜像并部署到 `/opt/chat-web-account-service`。
- 本仓库使用独立 Self-hosted Runner；部署必须包含健康检查、部署后验证和失败自动回滚，不得使用 `--remove-orphans`。

## HTTP 模块实现基准

- `src/modules/sheet/` 中的 Controller、Service、Utils Service、Module 和 DTO 是本仓库 HTTP 业务模块的唯一结构基准；菜单管理模块使用 `sheet` 命名，数据库实体仍保留 `TbAccountMenu` 等持久化名称。重构其他模块时保持该基准目录稳定，不得复制出另一套分层或命名规则。
- Controller 必须保持为薄协议层：除装饰器、`query`/`body` DTO、当前身份参数和调用同名 Service 方法外，不得进行 DTO 拆包、字段转换、默认值注入、数据库访问、业务校验或响应结构拼装。
- 公开 HTTP 方法统一声明为 `public async`；CRUD、列表等通用动作通常使用 `httpBaseAccount<Action><Resource>`，Tree、Resolver 等资源专属读取语义可使用 `httpBaseAccount<Resource><Action>`，例如 `httpBaseAccountSheetTree`、`httpBaseAccountSheetResolver`。方法名应保持业务语义清晰及同模块一致，Controller 与对应 Service 的方法名称必须完全相同并直接返回调用结果；不得只为统一单词顺序而机械倒装。
- Cookie 读写、Header 解析、流或文件响应、SVG 输出等依赖 Express 的纯 HTTP 协议适配允许保留在 Controller。禁止把 `Request`、`Response`、Cookie、Header 或响应发送逻辑传入业务 Service；协议例外必须写中文职责注释。
- 每个接口入参必须使用模块 `dto/` 下独立 DTO。Controller 不得以内联类型、散乱原始参数或私有 Adapter 代替 DTO；服务端三态字段需要由 DTO 明确保留 `undefined`、`null` 与具体值。
- 业务 Service 引用本模块请求 DTO 时统一使用 `import * as <Module>Dto` 命名空间归组，并通过 `<Module>Dto.<Type>` 标注参数；响应 DTO 继续按需使用命名导入，禁止把请求与响应协议混在同一组散乱导入中。
- 每个接口必须通过 `ApiServiceDecorator` 完整声明请求的 `source`、`type` 和响应的 `type`、`isArray`（数组响应时）及中文说明；确实无入参的接口直接省略 request 配置，禁止为文档形式制造空 DTO。
- 对应 Service 的公开 HTTP 方法必须添加简洁中文职责注释、声明明确的 `Promise<返回类型>` 并负责完整业务响应；成功结果对象也在 Service 中返回，Controller 不得额外包一层或临时拼装。
- DTO 字段必须提供 Swagger 示例/说明、必要的类型转换和中文校验消息；优先使用 `PickType`、`PartialType`、`IntersectionType` 复用共享 DTO，分页 DTO 继承公共 `PageDto`。
- Entity 查询优先使用公共 `DataBaseService.builder`，QueryBuilder 别名固定为 `t`，并统一条件拼装；事务、批量关系写入及 TypeORM 必须原生能力可继续使用 `EntityManager`/`Repository`。
- 可复用的实体查找、唯一性校验、引用校验、锁、数据范围、树构建和批量关系转换必须抽到 `<module>.utils.service.ts`；Utils Service 使用 `@Injectable()`，公开工具方法写中文职责注释，并在对应 Module 的 `providers` 中注册后由业务 Service 注入。仅调用一次且无复用价值的简单步骤不得机械拆成 Utils Service。
- 多步校验后写入、唯一性校验后写入、层级调整和关联关系替换必须由 Service 建立 TypeORM 事务；Utils 方法参与事务时接收 `EntityManager` 并始终使用该 Manager 的 Repository，需要并发保护时先锁定相关数据。Module 按 `imports`、`controllers`、`providers`、`exports` 组织。
- 普通可选入参使用 `isEmpty`/`isNotEmpty` 判断，禁止使用 `value === undefined`、`value === null` 或隐式 truthy 判空。实体或 Map 查询结果可使用 `if (!entity)` 获得 TypeScript 类型收窄；数组使用明确的 `length === 0`/`length > 0`，布尔业务状态按布尔语义判断。
- 三态更新字段以业务语义优先，例如 `parentKeyId` 的 `undefined` 表示不修改、`null` 表示清空父级、数字表示设置父级；此类必要的 `=== undefined` 判断允许保留，但必须紧邻中文注释说明三态含义。
- 常规重构不得改变现有路由、HTTP 方法、权限码、认证方式、响应字段、异常消息和事务语义；明确的模块命名迁移若需同步公开路由，必须同时更新客户端、回归测试和部署变更记录，并提供回滚方法。完成后至少执行格式检查、TypeScript 类型检查、Nest 构建和完整测试。

## 部署变更记录

任何会影响 Docker 构建、服务启动、运行参数、Nacos、端口、健康检查、Runner、部署目录或外部网络的修改，都必须在同一次改动中更新 `deploy/CHANGELOG.md`。

变更记录至少包含：日期、影响机器、关联版本、变更内容、机器侧操作、验证命令和回滚方法。禁止在文档中记录密码、Token、私钥或完整 `.env`。

修改以下文件时默认属于部署变更：

- `Dockerfile`、`.dockerignore`
- `.github/workflows/**`
- `deploy/**`
- `.env.example`
- Nacos 配置结构、Data ID、Group、Namespace、服务名
- 服务端口、数据库地址、Docker 网络和健康检查

排障命令和当前运行基线维护在 `deploy/RUNBOOK.md`。

## 分支生命周期

- 远程仓库只保留 `main`、`developer` 两个长期分支；临时需求分支必须先合并到 `developer`，发布时同步合并到 `main`，合并并验证通过后立即删除远程和本地临时分支。

## 服务数据边界

- 本服务独占 MySQL 数据库 `chat_web_account`，运行与 Schema 升级账号只能访问 `chat_web_account.*`，不得拥有全局权限、其他业务库权限或跨库角色；数据库必须由外部基础设施预创建。
- 本服务独占 Redis index `0`，登录会话、验证码和缓存不得写入其他 index。
- 本服务是身份与会话的唯一所有者。其他服务只能通过 `/auth/token/introspect` 等强类型 HTTP 接口访问身份信息，不得共享 JWT 密钥、数据库 Entity 或 Redis 会话。
- 本服务需要其他业务数据时同样必须使用强类型 HTTP 客户端 Provider，不得连接其他服务数据库或执行跨业务库 SQL。
- 若新增跨服务调用，地址和超时统一读取 Nacos `feign.chat-web-*.url/timeout`，不得在部署 `.env` 固定业务 URL；当前 Account 不注册无业务用途的 Feign 客户端。

## Git 提交规范

- 所有提交信息必须使用 Conventional Commits 类型前缀，格式固定为 `<type>: 中文摘要`；如需填写作用域，使用 `<type>(<scope>): 中文摘要`。
- `type` 只能使用以下类型：`init`（项目初始化）、`feat`（添加新特性）、`fix`（修复缺陷）、`docs`（仅修改文档）、`style`（仅调整格式或样式）、`refactor`（代码重构）、`perf`（性能优化）、`test`（增加或调整测试）、`build`（构建或依赖变更）、`ci`（持续集成或部署配置）、`chore`（工程工具或其他维护性变更）。
- 提交摘要、正文和脚注必须使用中文；类型前缀保留上述英文小写关键字，代码标识符、命令和版本号可按实际需要保留原文。
- 每个提交应聚焦单一目的，摘要使用动词开头并准确说明影响范围，禁止使用 `update`、`modify` 等无意义描述或整句英文提交信息。
- 示例：`feat: 新增客户归属人筛选`、`fix: 修复 Nacos 服务注册失败`、`docs: 补充部署回滚说明`。

## 共享 Schema 依赖联动

- 当任务包含 `chat-web-base-schema` 公共能力变更时，Agent 必须自行等待共享包发布，随后将本服务升级到明确的新版本，不得要求用户手动更新依赖。
- 升级后应优先使用共享包导出的实现并删除本地重复代码，运行仓库要求的完整测试，并按部署规则同步变更记录。
- 用户已授权完成该联动任务时，Agent 应自行提交、推送、创建 PR 并合并到默认分支；只有权限、认证、分支保护或持续失败的 CI 确实阻止时才请求用户介入。
