# 部署变更记录

## 2026-09-04：禁止部署流程回写 Nacos 配置

- 影响范围：Account `chat-home-server` 部署流水线。
- 变更内容：数据库隔离步骤改为只读校验，继续兼容 Nacos `database`/`name` 两种字段；不再生成随机账号、修改授权或回写 Nacos，人工配置的字段、注释和顺序保持原样。
- 机器侧操作：若校验提示数据库账号权限未隔离，请由数据库管理员人工创建仅拥有本服务数据库权限的账号，并在 Nacos 中维护连接配置后重新部署。
- 验证命令：执行 `yarn tsc -p tsconfig.json --noEmit`、`yarn build` 和 `yarn test`；检查部署日志无 Nacos 配置发布请求。
- 回滚方法：恢复上一版 Account 镜像；Nacos 配置和数据库授权不回滚。

## 2026-09-03：本地 Nacos 客户端端口冲突自动避让

- 影响范围：Account 本地开发启动；`chat-home-server` 的生产容器启动命令不变。
- 关联版本：Account 本次 `developer` 分支提交。
- 变更内容：`yarn dev`、`yarn start` 和 `yarn debug` 启动前检测 Nacos Node 客户端默认端口 `7777`，冲突时在 `20000-45000` 中随机选择本机可用端口并仅注入当前子进程；不修改 `.env`、Nacos 或 Docker 配置。
- 机器侧操作：无需配置固定 `NODE_CLUSTER_CLIENT_PORT`；继续按现有 Nacos 启动参数运行。
- 验证命令：执行 `yarn prettier --check scripts/start-with-cluster-port.cjs`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build`，并分别验证默认端口空闲和占用场景。
- 回滚方法：恢复本次提交前的 `package.json` 并删除启动包装器；Nacos 与业务数据无需回滚。

## 2026-09-03：接入嵌套 Feign 配置兼容层

- 影响机器：`chat-home-server`。
- 关联版本：Account 本次完整 Git SHA 镜像。
- 变更内容：启动时读取 Nacos `feign` 节点并映射共享 Feign 运行时所需的地址和超时键；Account 无出站业务调用时不创建额外客户端。Nacos 配置保持人工维护，服务不回写配置。
- 机器侧操作：仅更新 Account 镜像并重启服务；不要在 `.env` 增加业务地址或超时，也不要修改 Nacos 配置。
- 验证命令：执行 `yarn build`、`yarn tsc -p tsconfig.json --noEmit` 和 `node --test test/*.test.cjs`；部署后检查 `/health/live` 及 Nacos 注册状态。
- 回滚方法：恢复上一版 Account 镜像；Nacos 配置不回滚。

## 2026-09-03：补齐 Skyline 系统任务菜单入口

- 影响机器：`chat-home-server`。
- 关联版本：Account 本次完整 Git SHA 镜像；Skyline 系统任务管理页面 `/deploy/datetask/system`。
- 变更内容：新增系统任务菜单种子（权限码 `skyline:datetask:list`），挂载到综合设置 `/deploy` 下并授权已有综合设置角色及超级管理员；任务数据和执行逻辑仍由 Skyline 负责，Account 不新增业务表。
- 机器侧操作：发布 Account 镜像后流水线自动执行 `repair-datetask-menus.js --apply`，无需手工 SQL；不得使用 `--remove-orphans`。
- 验证命令：执行 `yarn format:check`、`yarn build`、`node --test test/*.test.cjs`；部署后检查账号权限接口返回 `/deploy/datetask/system` 菜单，并确认 Skyline `/health/live` 正常。
- 回滚方法：恢复上一版 Account 镜像并移除本次菜单及角色关系；不影响 Skyline 表结构和任务数据。

## 2026-09-02：新增职位管理与账号职位关联

- 影响机器：`chat-home-server`。
- 关联版本：`@wlisfes/chat-web-base-schema` 职位表结构发布版本，以及 Account 本次完整 Git SHA 镜像。
- 变更内容：新增 `tb_account_position` 职位字典表和 `tb_account_user_position` 账号职位关系表；新增职位分页、详情、下拉、新增、编辑、删除接口；账号创建、编辑、详情和分页筛选支持 `positionKeyIds` 数组。增量 SQL 会把历史组织关系中的 `position_name` 去重迁移为职位及关系数据，删除已关联员工的职位会被拒绝；部署后幂等补齐职位菜单和按钮权限。
- 机器侧操作：先发布共享 Schema 包，再升级 Account 依赖并部署；部署脚本会自动应用两个职位表增量 SQL 并执行 `repair-position-menus.js --apply`，无需手动建表。不得跳过 Schema 账本或使用 `--remove-orphans`。
- 验证命令：执行 `yarn build`、`node --test test/*.test.cjs`；部署后检查 `/health/live`、`POST /api/account/position/column`、`GET /api/account/position/select`、账号详情中的 `positionKeyIds`/`positions`，并确认 Nacos 注册实例健康。
- 回滚方法：恢复上一版 Account 完整镜像；新增表和已迁移职位数据保留，不回滚已应用的增量 SQL。若需隐藏入口，恢复职位菜单权限数据或回滚 Manager 镜像。

## 2026-09-02：统一菜单与部门模块路由命名

- 影响机器：`chat-home-server`；本次仅提交 `developer`，未合并 `main` 或触发部署。
- 关联版本：Account、Manager 和 Gateway 的本次 `developer` 分支提交。
- 变更内容：Account 的菜单模块目录、类和 DTO 统一为 `sheet`，部门组织模块统一为 `dept`；公开接口前缀由 `/api/account/menu`、`/api/account/organization` 调整为 `/api/account/sheet`、`/api/account/dept`。数据库实体、表名和已持久化权限码保持不变。
- 机器侧操作：发布时先部署 Account，再部署 Manager；Nacos Gateway 继续使用 `/api/account/**` 通配路由，无需新增路由配置。
- 验证命令：执行 `yarn build`、`yarn tsc --noEmit -p tsconfig.json`、`node --test test/*.test.cjs`；部署后检查 `/api/account/sheet/tree/structure`、`/api/account/dept/tree/structure` 和 `/health/live`。
- 回滚方法：恢复上一版 Account 与 Manager 完整 Git SHA；若需回滚路由，使用旧版 `/api/account/menu`、`/api/account/organization` 客户端和镜像，数据库与权限数据不回滚。

## 2026-08-31：升级共享包并接入独立 Redis index

- 影响机器：`chat-home-server`。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.19`。
- 变更内容：Account 升级共享包依赖；`RedisModule` 改为 `RedisModule.forRoot({ database: 0 })`，确保会话和验证码固定使用 Account Redis index `0`。
- 机器侧操作：重新安装依赖并重新构建 Account；确认 Nacos `redis.database` 使用 `0`，不把 Redis 连接字段补回 `.env`。
- 验证命令：`yarn install --frozen-lockfile`、`yarn build`、`yarn test`；部署后检查 `/health` 与 Redis index。
- 回滚方法：恢复上一版 Account 镜像和 `@wlisfes/chat-web-base-schema@1.4.18`；Nacos 配置和 Redis 数据不回滚。

## 2026-08-29：部署前清理旧版 Nacos 覆盖项

- 变更内容：部署流水线自动从主机 `.env` 移除 `NACOS_REQUEST_TIMEOUT`、`NACOS_REGISTER_PORT`、`NACOS_REGISTER_IP`、`NACOS_REGISTER_REQUIRED`、`NACOS_GROUP` 和 `NACOS_CONFIG_GROUP`，统一使用共享包默认值。
- 修复原因：历史 `.env` 残留字段会覆盖新的端口和分组默认值，导致服务注册信息与实际监听配置不一致。
- 影响范围：仅修改 Account 部署主机的启动覆盖项，不影响 Nacos 远端业务配置。

## 2026-08-29：统一 Nacos 启动参数转换

- 影响机器：`chat-home-server`；本次仅改造调用代码，不触发镜像构建或线上部署。
- 关联版本：等待 `@wlisfes/chat-web-base-schema` 发布包含 `forRootNacosRuntimeOptions` 的新版本。
- 变更内容：Account 改为直接调用 `NacosModule.forRoot(forRootNacosRuntimeOptions(process.env))`，移除逐字段环境变量映射。
- 机器侧操作：共享包发布并升级后再重建 Account；现有 Nacos 配置、端口和数据库不变。
- 验证命令：共享包发布后执行 `yarn build && yarn test`，再按本服务健康检查验证。
- 回滚方法：恢复上一版共享包并还原旧的 `createNacosRuntimeOptions` 调用。

## 2026-08-29：统一服务监听端口为 5010

- 影响机器：`chat-home-server`；Company Runner 当前离线，本次不等待其部署结果。
- 关联版本：Account 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：Account 容器、Nacos 注册和健康检查端口由 `3000`/`4000` 统一为 `5010`；云端生产与 development Data ID 的 `server.port` 已同步为 `5010`。
- 机器侧操作：下次部署重新创建 Account 容器，使 `PORT=5010` 生效；数据库、Redis index `0`、Nacos 命名空间和网络不变。
- 验证命令：检查 `docker inspect` 中的 `PORT=5010`、访问容器 `/health/live`，并确认 Nacos 注册实例端口为 `5010`。
- 回滚方法：恢复上一条健康 Account 完整 SHA，并将 Nacos `server.port` 与注册端口恢复为旧值。

## 2026-08-29：统一环境示例并补充 Nacos 鉴权读取

- 影响机器：`chat-home-server`；Company Runner 当前离线，本次不等待其部署结果。
- 关联版本：Account 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：根目录与部署目录 `.env.example` 统一只描述启动和 Nacos 参数，业务数据库、Redis、JWT 及路由配置继续由云端 Nacos 管理；为 Schema、数据库隔离和历史迁移 CLI 增加 Nacos 登录令牌，兼容开启鉴权的配置中心。
- 机器侧操作：无需迁移数据库或修改 Redis index `0`；确认部署主机 `.env` 保留 Nacos 用户名和密码，真实密钥不得提交仓库。
- 验证命令：执行 `yarn build`；使用鉴权令牌读取 Account Data ID，并检查 `/health/live` 和 Nacos 服务注册。
- 回滚方法：恢复上一条健康 Account 完整 SHA；Nacos、数据库和 Redis 数据均不回滚。

## 2026-08-29：部署拓扑收敛到 chat-home-server

- 影响机器：仅 `chat-home-server`；原另一台部署机器已废弃并下线，不再创建部署任务。
- 关联版本：Account 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：删除 Company/Home 双机矩阵，Runner 选择标签统一为 `chat-home-server`，继续使用 `production-home` Environment 和 `/opt/chat-web-account-service` 部署目录；演示客户只在当前主机生成。
- 机器侧操作：Account 仓库在线 Runner 的自定义标签已由 `chat-server-home` 更新为 `chat-home-server`，systemd 服务保持运行；废弃机器的离线 Runner 登记已从 GitHub 删除，若要恢复只能使用新 Token 重新注册。无需修改 `.env`、Nacos、数据库、Redis index `0`、端口或 Docker 网络。
- 验证命令：校验 Actions YAML 和 actionlint 配置，确认现行配置不再引用 `chat-server-company`、`chat-server-home`、`production-company` 或部署矩阵。
- 回滚方法：若新标签无法调度，仅把当前单机任务和在线 Runner 的自定义标签临时改回 `chat-server-home`；不得恢复废弃机器的部署任务，业务数据不回滚。

## 2026-08-28：统一可读日志与显式 Nacos 运行参数

- 影响机器：Home；Company Runner 当前离线，本次不等待其部署结果，恢复后继续兼容同一完整 SHA。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.15`、Account 本次完整 Git SHA 镜像。
- 变更内容：统一使用共享 `ReadableConsoleLogger` 和请求日志默认过滤规则；请求日志只保留 `logId`，本地 JSON 保留缩进、生产 JSON 压缩为单物理行。按新版公共包契约显式映射现有 `NACOS_*` 启动参数，并向 Swagger 启动器传入 `NODE_ENV`。
- 机器侧操作：无需新增或修改 `.env`、Nacos Data ID、数据库、Redis index `0`、端口、Runner、部署目录或外部网络；继续使用服务器现有 Nacos 连接参数。
- 验证命令：执行 `yarn format:check && yarn tsc -p tsconfig.json --noEmit && yarn test`；部署后检查 `/health/live`、Nacos 注册实例及 `docker logs --tail 100 chat-web-account-service` 的彩色单行请求 JSON。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；Nacos、数据库和 Redis 数据均不回滚。

## 2026-08-26：根目录运行配置收口到 Nacos

- 影响机器：Company、Home；容器部署参数和双机矩阵不变。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.10`、Account 本次完整 Git SHA 镜像；Nacos Data ID `chat-web-account-service.yaml`。
- 变更内容：根目录 `.env.example` 仅保留 `NODE_ENV`、`PORT` 和 Nacos 建连字段；Account 专属 MySQL、Redis index `0` 和 JWT 配置继续由远端 Data ID 提供，不新增第二份本地 YAML。
- 机器侧操作：各环境在自己的 Namespace 中维护真实数据库、Redis 和 JWT 配置。服务器 `deploy/.env` 仍按现有部署脚本管理基础设施连接，不复制根目录示例。
- 验证命令：执行 `yarn format:check && yarn test`；确认根 `.env.example` 的有效键只有 `NODE_ENV`、`PORT`、`NACOS_SERVER`、`NACOS_NAMESPACE`，并核对远端 Data ID 中 Redis index 为 `0`。
- 回滚方法：恢复上一条健康 Account 完整 SHA；Nacos 真实配置与数据库、Redis 数据均不回滚。

## 2026-08-26：显式注入完整 Nacos 运行参数

- 影响机器：Company、Home；两台机器继续部署同一个 Account 完整 Git SHA 镜像。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.9`；Account 本次完整 Git SHA 镜像。
- 变更内容：由 base 内的 `NacosModule.forRoot` 统一把扁平化 `.env` 转换为完整 `NacosRuntimeOptions`；Account 只传入服务名和注册端口，不再调用环境转换方法。环境示例补充请求超时及每项默认行为。
- 机器侧操作：确认 `/opt/chat-web-account-service/.env` 显式包含本机 `NACOS_SERVER`、`NACOS_NAMESPACE`；现有其他 `NACOS_*` 可保留，省略时按示例注释使用默认值。无需修改数据库、Redis index、端口、Runner、部署目录或外部网络。
- 验证命令：执行 `yarn format:check && yarn test` 和 `IMAGE=example.invalid/chat-web-account-service:compose-check docker compose --env-file deploy/.env.example -f deploy/compose.yml config --quiet`；部署后检查 `/health/live`、`/health` 及 Nacos 中 `chat-web-account-service:3000` 实例。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像，并保留原服务器 `.env`；无需回滚数据库、Redis 或 Nacos 数据。

## 2026-08-25：移除 OpenTelemetry 运行依赖

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：Account 本次完整 Git SHA 镜像。
- 变更内容：移除 OpenTelemetry 自动插桩、OTLP Trace/指标导出和 Alloy 地址配置；保留单行 JSON、请求 ID 与 Docker 日志轮转。
- 机器侧操作：部署脚本会从现有 `.env` 自动移除遗留 `OTEL_*` 和 OpenTelemetry `NODE_OPTIONS`；无需修改 Nacos、数据库、Redis、端口或网络。
- 验证命令：执行 `yarn format:check && yarn test` 和 Compose 配置校验；部署后确认容器环境中不存在 `NODE_OPTIONS`、`OTEL_*`，并验证 `/health/live`。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；业务数据不回滚。

## 2026-08-24：GHCR 登录增加网络退避重试

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：Account 本次完整 Git SHA 镜像及部署工作流。
- 变更内容：自托管 Runner 登录 GHCR 时最多尝试8次，并按5秒递增退避；与现有镜像拉取重试共同覆盖 Registry 瞬时 EOF，避免镜像已经成功构建却因单次登录网络波动中断部署。
- 机器侧操作：无需修改 Secret、`.env`、Nacos、数据库、Redis、端口、Runner、部署目录或网络；合并后由 Home Runner 自动部署。
- 验证命令：检查 GitHub Actions 的 `Pull and deploy image` 步骤；部署后执行 `docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 和 `curl -fsS http://127.0.0.1:3000/health/live`。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；如仅回滚工作流可删除登录重试逻辑，不涉及数据库、Redis、Nacos 或业务数据回滚。

## 2026-08-23：接入统一日志、指标与链路追踪

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.6`、`@opentelemetry/auto-instrumentations-node@0.79.0`；Account 本次完整 Git SHA 镜像。
- 变更内容：Nest 启动与请求日志统一输出单行 JSON，并关联 `requestId`、`traceId`、`spanId`；自动采集 HTTP、Nest、跨服务调用、MySQL、Redis 和 Node 运行指标，通过 Alloy OTLP/HTTP 上报到 Tempo 与 Prometheus；部署脚本把镜像完整 SHA 写入 `service.version`。
- 机器侧操作：先部署 `chat-web-observability`，确认 `chat-web-alloy:4318` 在 `chat-web-infrastructure` 网络内可达；现有 `.env` 无需新增必填项，默认环境标识为 `production-home`。
- 验证命令：执行 `yarn format:check && yarn test` 和 `docker compose --env-file deploy/.env.example -f deploy/compose.yml config --quiet`；部署后验证 `http://127.0.0.1:3000/health/live`，并在 Grafana 查询 `service=chat-web-account-service` 的日志、指标和 Trace。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；无需回滚数据库、Redis、Nacos 或观测平台数据。

## 2026-08-23：聚合接口文档与工作流语法修复

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.2`；Account 本次完整 Git SHA 镜像。
- 变更内容：全部 Controller 使用聚合 Swagger/Apifox 装饰器，补齐请求字段、统一响应外壳、分页/树/详情响应模型及示例；修复 `workflow_dispatch.seedDemoConsumers` 三个字段的 YAML 缩进，恢复 GitHub 对部署工作流的正确解析。
- 机器侧操作：无需修改 Nacos、`.env`、数据库、Redis、端口、Runner、部署目录或网络；Home Runner 按现有流程更新同一完整 SHA 镜像。
- 验证命令：执行 `yarn format:check --end-of-line auto && yarn test`；部署后检查 `/api/swagger-json`，并验证 `/health`、登录、客户分页和用户分页接口。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；无需回滚数据库、Redis、Nacos 或共享 Schema SQL。

## 2026-08-23：发布跨服务 Feign 接口契约

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.3.0`；Account 本次完整 Git SHA 镜像。
- 变更内容：Account 的 Token 内省和 Consumer 查询接口已纳入共享声明式 Feign 契约，供 Finance、CRM 等业务服务通过 `AccountFeignClient` 调用；Account 仍是接口实现方和数据唯一所有者。
- 机器侧操作：无需修改 Nacos、`.env`、数据库、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn format:check && yarn test`；部署后验证登录、Token 内省、Consumer resolver/select 以及 Finance、CRM 远程调用。
- 回滚方法：恢复上一条健康 Account 镜像，并同步回滚 Finance、CRM 到共享包 1.2.2；不回滚数据库和 Nacos。

## 2026-08-23：登录有效期调整为10小时

- 影响机器：Home 当前环境；Company 恢复在线后使用同一 Nacos 配置基线。
- 关联配置：Nacos `chat-web-account-service.yaml` 的 `security.jwt.accessTokenTtlSeconds=36000`。
- 变更内容：Access Token、Redis 登录会话和管理端 Token Cookie 的单次有效期由1小时调整为10小时；管理端在使用时间达到30%后，于下一次接口请求时自动轮换 Token 并重新获得10小时。
- 机器侧操作：配置已发布到 Nacos，Account 日志确认动态应用 `security` 节点，无需重启服务或修改 `.env`、数据库、Redis、端口和网络。已经签发的 Token 保留原到期时间，新登录或下一次续期开始使用10小时。
- 验证命令：读取 Nacos 配置确认 `accessTokenTtlSeconds=36000`，检查 Account 日志出现配置更新记录；新登录响应的 `expiresIn` 应为 `36000`。
- 回滚方法：将 Nacos `security.jwt.accessTokenTtlSeconds` 恢复为 `3600`；已签发 Token 保留各自原到期时间，不清理 Redis 会话。

## 2026-08-23：Home Runner 统一迁移为主机服务

- 影响机器：Home；Company Runner 离线状态保持不变。
- 关联版本：Account、Finance、CRM 本次 Runner 基线调整；不修改业务镜像接口。
- 变更内容：Finance、CRM 的仓库级 Home Runner 从独立 Docker 容器迁移到 Ubuntu WSL systemd 服务，Account 原有主机 Runner 保持不变；删除会重新创建容器 Runner 的两个一次性注册工作流。各仓库仍使用独立 Runner 身份和目录，只共享同一物理主机与 `chat-server-home` 标签。
- 机器侧操作：Runner 安装目录固定为 `/home/runner/actions-runner-finance` 和 `/home/runner/actions-runner-crm`，部署目录固定为 `/opt/chat-web-finance-service` 和 `/opt/chat-web-crm-service`；旧 Runner 容器及已迁移 Docker 卷已删除。无需修改 `.env`、Nacos、数据库、Redis、端口或 Docker 网络。
- 验证命令：检查两个 systemd 服务均为 `active/enabled`，日志包含 `Connected to GitHub` 和 `Listening for Jobs`；以 `runner` 用户执行 `docker info`、`docker compose version`，并通过本次 main 发布验证 Home 部署。
- 回滚方法：停止对应 systemd 服务，在 GitHub 对应仓库生成新的临时注册 Token 后重新安装仓库级 Runner；保留 `/opt` 部署目录和业务容器，不回滚数据库或应用数据。

## 2026-08-23：升级共享远程鉴权运行时

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.2.2`；Account 本次完整 Git SHA 镜像。
- 变更内容：同步共享鉴权运行时版本。Account 继续作为身份与会话唯一所有者，保留登录、Token 签发、会话校验和 `/auth/token/introspect` 业务实现；下游服务改用共享远程鉴权模块。
- 机器侧操作：无需修改 `.env`、Nacos、数据库、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn format:check && yarn test`；部署后检查 `/health`、登录、Token 解析及 introspection。
- 回滚方法：恢复上一条健康 Account 完整 SHA 镜像；无需回滚数据库、Redis 或 Nacos。

## 2026-08-23：CRM 强类型客户读取接口与共享包升级

- 影响机器：Company、Home；需先于 CRM 首次部署完成。
- 关联版本：`@wlisfes/chat-web-base-schema@1.2.1`；Account 本次完整 Git SHA 镜像。
- 变更内容：新增 `GET /consumer/resolver` 和 `GET /consumer/select`，供 CRM 通过强类型 HTTP 客户端读取客户详情和下拉数据；客户主数据仍只存于 `tb_account_consumer`。新增幂等 CRM 菜单种子，部署后自动补齐 `/crm/consumer`、`/crm/partner`、`/crm/sms/quote/create` 和 `/crm/sms/quote` 并继承根目录角色授权。同步升级共享包 1.2.1。
- 机器侧操作：无需修改数据库结构、Redis、Nacos、端口、Runner、部署目录或外部网络；流水线在 Account 容器内执行 CRM 菜单数据修复。
- 验证命令：执行 `yarn test`；部署后携带有效 Token 验证两个接口，并确认权限树包含 CRM 规范路由且 CRM 不连接 Account 数据库。
- 回滚方法：回滚 Account 镜像；CRM 在旧接口不可用期间会返回上游异常，数据库无需回滚。

## 2026-08-22：客户主键重排与多归属人演示数据

- 影响机器：Company、Home；两台机器各自写入本机账号数据库，Company Runner 离线时任务保持排队。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.8`；Account 本次完整 Git SHA 镜像。
- 变更内容：`tb_account_consumer.key_id` 起点调整为 `5181000`，现有客户按原主键顺序平移并保留；新增基于 `@faker-js/faker@8.4.1` 的固定种子脚本，生成 120 条客户并轮询分配到最多 20 个启用账号归属人，仅使用 Finance 中启用的演示品牌 1-11，并可幂等修正已存在演示客户的失效品牌。客户列表补全归属账号及组织名称，管理端可直接显示业务员和部门。
- 机器侧操作：自动部署先应用 Schema 增量；本次使用 `workflow_dispatch` 并勾选 `seedDemoConsumers`，部署健康后在各自 Account 容器中幂等造数。无需修改 `.env`、Nacos、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn test`；部署后查询客户总数、`MIN/MAX(key_id)`、`AUTO_INCREMENT`、`COUNT(DISTINCT owner_user_uid)` 及各归属人客户数，并再次执行造数命令确认 `inserted=0`。
- 回滚方法：应用镜像可回滚到上一条健康 SHA；主键变更和新增客户不自动逆向。若必须恢复数据，应停止写入并从部署前备份恢复账号库，禁止手工把新主键减去偏移量。

## 2026-08-22：动作式接口与结构化请求日志

- 影响机器：Company、Home；需与 Finance、Gateway、Manager 同一发布窗口部署。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.7`；Account 本次完整 Git SHA 镜像。
- 变更内容：用户、组织、菜单、角色、权限模块统一为单数目录、类名和动作式路由；全部 Controller 只使用 GET query 或 POST body，移除路径参数及 PUT/PATCH/DELETE；Auth 改为 `/auth/codex/write` 与 `/auth/token/**`。接入共享请求 ID/结构化请求日志并脱敏敏感字段；Docker `json-file` 轮转调整为单文件 20m、保留 30 个文件。
- 机器侧操作：无需修改 `.env`、Nacos、数据库、Redis、端口、Runner、部署目录或网络；按 Account、Finance、Gateway、Manager 顺序部署联动版本。
- 验证命令：执行 `yarn test` 和 `docker compose -f deploy/compose.yml config --quiet`；部署后验证登录、账号/组织/角色/菜单/权限/Consumer 接口，并检查 `docker inspect chat-web-account-service --format '{{json .HostConfig.LogConfig}}'` 与脱敏请求日志。
- 回滚方法：同时回滚四个仓库到上一组健康镜像；不回滚数据库。旧 Manager 与新 Account 或新 Manager 与旧 Account 的接口契约不兼容，禁止只回滚一端。

## 2026-08-22 Consumer 单数路由与共享工具

- 影响机器：Company、Home；需与 Gateway、Manager 同一发布窗口部署。
- 变更内容：客户模块目录、文件、类和内部路由统一使用单数 `consumer`，公开地址固定为 `/api/account/consumer/**`；删除服务内 `src/common`，分页、树、UID 工具改由 `@wlisfes/chat-web-base-schema@1.1.4` 提供。
- 验证命令：执行 `yarn test`；部署后通过 Gateway 验证 `/api/account/consumer/column`，并确认旧 `/api/consumers/**` 不再使用。
- 回滚方法：同时回滚 Account、Gateway 和 Manager 到上一组镜像，避免新旧路径不一致。

## 2026-08-22：外部客户主表迁入账号域

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.3`；Account 本次完整 Git SHA 镜像。
- 变更内容：新增账号域 `tb_account_consumer` 和 `/consumer/**` 客户管理接口，使用独立客户 UID，并兼容现有管理端的品牌、币种、付款模式、余额、授信、阶段和认证字段；Finance 不再保存或写入客户主表。
- 机器侧操作：无需修改 `.env`、Nacos、端口、Runner、部署目录或外部网络；部署器会在启动新容器前自动创建 `tb_account_consumer`。需要保留的历史客户数据应先迁入 Account，旧 Finance 客户表随后由 Finance Schema 增量直接删除，本服务不会跨库读取。
- 验证命令：执行 `yarn test`；部署后执行 `docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3000/health`，并通过网关验证 `/api/account/consumer/column` 返回 HTTP 200 业务响应。
- 回滚方法：将 Account 恢复到上一条健康 SHA；保留新增的 `tb_account_consumer` 表，不执行 DROP。若新表已经写入客户数据，回滚前先停止管理端写入并导出备份，禁止把数据写回 Finance 旧表。

## 2026-08-22：默认分支与自动部署触发器统一为 main

- 影响机器：Company、Home。
- 关联版本：账号服务默认分支由 `master` 重命名后的 `main`；本次工作流修复提交及其完整 Git SHA 镜像。
- 变更内容：将 `Build and deploy` 的推送触发分支由已不存在的 `master` 改为 `main`，并同步 README 与部署说明，恢复默认分支合并后的自动构建、GHCR 推送和双机部署。
- 机器侧操作：无需修改 `.env`、Nacos、端口、Runner、部署目录或外部网络；合并到 `main` 后由现有 Company、Home Runner 部署同一完整 SHA。
- 验证命令：确认 GitHub 仓库默认分支和远端 `HEAD` 均指向 `main`；执行 `yarn test`；合并后确认 `Build and deploy` 由 `main` 的 push 事件触发，并在两台机器执行 `docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 与 `curl -fsS http://127.0.0.1:3000/health`。
- 回滚方法：回滚本次工作流提交并使用 `workflow_dispatch` 手动部署上一条健康 SHA；只有同时把 GitHub 默认分支恢复为 `master` 时才可恢复旧触发器，单独恢复旧触发器会再次导致默认分支合并不触发部署。

## 2026-08-19：服务数据边界与内部鉴权接口

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.2`；Account 本次完整 Git SHA 镜像。
- 变更内容：新增受全局 Bearer Guard 保护并保留真实协议状态的 `/auth/introspect`，供其他服务通过强类型 HTTP 客户端获取 `AuthPrincipal`；Account 继续独占 Redis index `0`。部署在 Schema 升级前幂等轮换 Account/Finance 旧全局账号为随机专用凭据并更新各自 Nacos，随后授权检查只允许 `USAGE ON *.*` 和本服务数据库权限，拒绝全局、跨库和角色权限。
- 机器侧操作：在两台机器使用 Account 数据库账号执行 `SELECT DATABASE(), CURRENT_USER()` 与 `SHOW GRANTS FOR CURRENT_USER()`；若账号同时可访问 Finance 或其他库，部署前隔离器会创建/切换为专用账号并仅授权 Nacos 中的实际服务数据库。Company 已完成下划线数据库的专用账号创建、Nacos 凭据轮换和授权验证；Home 的历史连字符数据库由同一引导兼容，不在线改库名。数据库必须预先存在，不修改端口、Runner、部署目录或外部网络。
- 验证命令：`yarn test`；部署后执行 `docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3000/health`，并用有效/失效 Bearer Token 验证 `/auth/introspect` 分别返回身份主体/HTTP 401。
- 回滚方法：将两台机器恢复到上一条健康 Account SHA；保留独立 MySQL 授权和 Redis index `0`。Finance 已切换远程内省后，不得回滚到缺少 `/auth/introspect` 的 Account 版本，除非先回滚 Finance。

## 2026-08-19：共享运行时模块接入

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.1`；账号服务本次完整 Git SHA 镜像。
- 变更内容：Redis 连接与生命周期、Nacos 配置加载和实例注册、JWT/Redis 会话、Bearer Guard 以及 MySQL 配置解析改为使用共享包的隔离子路径；账号服务只保留登录、验证码、密码、账号状态和权限等业务实现。保持 Nacos Data ID、服务名、端口 3000、Redis 会话键前缀、数据库环境变量覆盖白名单和健康检查语义不变。
- 机器侧操作：无需修改 `.env`、Nacos、Redis、数据库、端口、Runner、部署目录或外部网络；合并后由现有双机矩阵部署同一完整 SHA。
- 验证命令：`yarn test`；部署后分别执行 `docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3000/health`，并通过网关验证登录和 `/auth/me`。
- 回滚方法：将两台机器恢复到上一条健康账号服务 SHA；共享包 1.1.1 为新增子路径且向后兼容，无需回滚数据库、Nacos 或 Redis 数据。

## 2026-08-18：Finance Home Runner 维护重跑幂等化

- 影响机器：Home。
- 关联版本：Account Runner 安装工作流本次修复提交；Finance 镜像 `1362bda26d2e42d4c00577c05c12ffa5f73a3741`。
- 变更内容：Runner 启动阶段先读取 `chat-web-finance-runner-home` 容器状态；容器已运行时保留现有 GitHub 会话，只执行前置的配置同步与卷权限维护，不再强制删除重建，并通过步骤输出让验证阶段直接确认容器仍为 `running`。容器缺失、停止或退出时仍按原流程重建并等待 `Listening for Jobs`，避免维护重跑触发短暂的 GitHub `session already exists` 冲突或误等历史启动日志。
- 机器侧操作：无需修改 Secret、`.env`、Nacos、端口或网络；合并后可直接运行 `Register Finance Home runner` 验证幂等维护。
- 验证命令：重复运行注册工作流应全部成功；日志显示 Runner 容器已运行，Finance 仓库 Runner 状态保持 `online`；随后 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 仍返回目标 SHA 和 `healthy`。
- 回滚方法：回滚本次工作流提交即可恢复强制重建行为；不涉及服务容器、数据库或持久卷数据回滚。

## 2026-08-18：Finance Home 部署卷权限与无 Token 维护重跑

- 影响机器：Home。
- 关联版本：Account Runner 安装工作流本次修复提交；Finance 镜像 `1362bda26d2e42d4c00577c05c12ffa5f73a3741`。
- 变更内容：Runner 准备阶段把独立的 `chat-web-finance-deploy-home` Docker 卷挂载到辅助容器，并将卷根目录及已有内容归属到实际 Runner UID/GID，确保 `/opt/chat-web-finance-service` 可写。临时注册 Token 仅在注册卷中不存在 `.runner` 时才是必需项；已注册 Runner 的权限修复和维护重跑不再要求恢复已删除的 Secret。
- 机器侧操作：合并后重新运行 `Register Finance Home runner`，随后重跑 Finance 部署失败任务；无需重新创建 `FINANCE_RUNNER_REGISTRATION_TOKEN`，无需修改完整 `.env`、Nacos、端口或 Docker 网络。
- 验证命令：注册工作流成功；Finance Home 的 `Validate local Docker host` 通过目录可写检查；`docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 返回目标完整 SHA 和 `healthy`。
- 回滚方法：回滚本次工作流提交不会撤销已修正的卷属主；如确需恢复，停止 Finance Runner 后按部署前备份恢复卷权限。不要删除包含部署状态的 `chat-web-finance-deploy-home` 卷。

## 2026-08-18：Finance Home Runner 安装分步与故障可观测性

- 影响机器：Home。
- 关联版本：Account 部署工作流本次修复提交；Finance 镜像 `260bd2fd2df4b9b07d01dcfaf73264fdbcd6f319`。
- 变更内容：将 Finance 专用 Runner 安装拆分为运行时准备、共享配置同步、容器启动和上线验证四个步骤；共享配置直接经 stdin 写入已缓存的官方 Runner 镜像，不再依赖额外 Alpine 镜像。启动时明确工作目录并兼容 Runner 用户为 root 的情况；容器提前退出时立即输出不含业务密钥的 Runner 日志并失败，避免等待超时且便于定位。
- 机器侧操作：合并后重新运行 `Register Finance Home runner`；成功后立即删除 Account 仓库临时 Secret `FINANCE_RUNNER_REGISTRATION_TOKEN`。无需修改端口、Nacos、Redis 或完整 `.env`。
- 验证命令：确认四个安装步骤全部成功；`gh api repos/Wlisfes/chat-web-finance-service/actions/runners --jq '.runners[] | select(.name == "chat-server-home-finance") | [.status, .busy]'` 返回 `online`；Finance 的 `Deploy to home` 任务完成并通过容器内 `/health` 检查。
- 回滚方法：回滚本次工作流提交不影响已运行服务；如需撤销 Finance Home Runner，先从 Finance 仓库移除对应 Runner，再停止并删除 `chat-web-finance-runner-home` 容器和注册卷，保留部署卷以便恢复。

## 2026-08-18：Finance Home Runner 环境同步兼容修复

- 影响机器：Home。
- 关联版本：Account 部署工作流本次修复提交；Finance 镜像 `260bd2fd2df4b9b07d01dcfaf73264fdbcd6f319`。
- 变更内容：Finance 专用 Home Runner 已完成镜像下载和仓库注册；将共享环境变量筛选脚本中的 awk 循环变量由内置函数名 `index` 改为普通变量 `i`，兼容 Home Runner 当前 awk 实现，避免在复制 JWT、Redis、Nacos 参数时出现语法错误。筛选白名单、目标 Docker 卷和文件权限保持不变。
- 机器侧操作：合并后重新运行 `Register Finance Home runner`；工作流复用已缓存镜像和已注册 Runner 卷，成功后立即删除 Account 仓库临时 Secret `FINANCE_RUNNER_REGISTRATION_TOKEN`。无需修改端口、Nacos、Redis 或完整 `.env`。
- 验证命令：确认注册工作流成功；`gh api repos/Wlisfes/chat-web-finance-service/actions/runners --jq '.runners[] | select(.name == "chat-server-home-finance") | [.status, .busy]'` 返回 `online`；Finance 的 `Deploy to home` 任务完成并通过容器内 `/health` 检查。
- 回滚方法：回滚本次工作流提交不会影响已运行服务；如需撤销 Finance Home Runner，先从 Finance 仓库移除对应 Runner，再停止并删除 `chat-web-finance-runner-home` 容器和注册卷，保留部署卷以便恢复。

## 2026-08-18：健康检查真实 HTTP 状态修复

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.0.8`。
- 变更内容：共享异常过滤器在真实 Nest `ArgumentsHost` 中通过请求标记识别 `PreserveHttpStatus`；账号 readiness 失败恢复 HTTP 503，并将数据库、Redis、JWT 就绪详情放入响应 `data`。普通业务异常继续返回 HTTP 200 和自定义 `code`。新增受控的手动工作流，用现有 Account Home Runner 和 GitHub 官方 Actions Runner 容器安装 Finance 仓库专用 Home Runner，无需主机 sudo。Runner 注册信息与 `/opt/chat-web-finance-service` 分别使用独立 Docker 持久卷，并只复制 JWT、Redis、Nacos 必需参数。
- 机器侧操作：账号服务无需修改端口、Nacos 或 `.env`，由流水线重建并滚动部署镜像。首次安装 Finance Home Runner 时临时设置 `FINANCE_RUNNER_REGISTRATION_TOKEN`，运行 `Register Finance Home runner` 后立即删除该 Secret。
- 验证命令：`curl -i http://127.0.0.1:3000/health`；健康时为 HTTP 200，依赖故障时为 HTTP 503。
- 回滚方法：恢复上一条健康 SHA 镜像；无需回滚数据库和配置。如需撤销 Finance Home Runner，先在 Finance 仓库删除 Runner，再停止并删除 `chat-web-finance-runner-home` 容器和 `chat-web-finance-runner-home` 注册卷；`chat-web-finance-deploy-home` 部署卷保留用于恢复。

本文件只记录会影响服务器构建、部署、启动或运行的变更，不记录密码、Token、私钥和真实 `.env`。

新增记录必须包含：影响范围、关联版本、变更内容、机器侧操作、验证方式和回滚方式。最新记录放在最前面。

## 2026-08-18：财务菜单恢复与岗位角色树数据修复

- 影响范围：Company 现有账号库和管理端；Home 仅在以后导入旧平台数据时应用同一迁移规则。
- 关联版本：账号服务、管理端本次财务菜单与岗位角色树修复提交。
- 变更内容：角色列表批量返回数据范围及组织授权，管理端据此把单组织岗位角色挂回组织树；旧平台迁移会把财务中心设为可见目录，并补齐基础设置、账户管理、资费管理及前端现有六个财务页面。新增默认回滚、显式 `--apply` 才提交的幂等财务菜单修复命令；所有关联继续使用自增 `key_id`，不新增 UID 字段。原本拥有财务中心的角色以及 `super_admin` 会补齐子菜单授权。
- 机器侧操作：合并部署账号服务后，在 Company 账号服务源码或同版本构建产物中先运行 `yarn menu:repair-finance` 核对 dry-run，再运行 `yarn menu:repair-finance --apply`；该操作只更新账号库菜单和角色菜单关系，不修改 Nacos、端口、Redis、Docker 网络或完整 `.env`。
- Company 实际执行结果：已对当前账号库正式执行一次，创建 9 个子菜单、修复 1 个财务中心父节点并补齐 9 条角色菜单关系；随后再次 dry-run 的新增数和授权数均为 0。当前共 10 个 `/finance%` 节点，全部启用且可见。

### 验证

```bash
yarn test
yarn menu:repair-finance
curl -fsS http://127.0.0.1:3000/health
```

登录管理端后，财务中心应显示三个分组和六个页面；角色管理左侧只保留通用角色平铺列表，单组织岗位角色按部门组织层级展示。财务页面内的旧 `/api/windows/finance/**` 业务接口不属于账号服务，本次只恢复菜单入口。

### 回滚

- 回滚账号服务和管理端到上一条已验证镜像。
- 数据回滚前先备份账号库；删除本次新增财务子菜单对应的 `tb_account_role_menu` 关系后，再按子节点到父节点顺序删除 `/finance/%` 节点，并把原 `/finance` 节点恢复为修复前的类型和可见状态。
- 不删除组织、角色、用户或 Redis 数据，不修改其他菜单授权。

## 2026-08-18：GHCR 镜像拉取重试增强

- 影响范围：Company、Home 账号服务自动部署；重点处理 Company 到 GHCR/容器 Blob 存储链路的间歇性 EOF。
- 关联版本：账号管理查询兼容版本 `25caaf614fede9b965c251aa2f9a458a0745b34a` 的后续部署可靠性提交。
- 变更内容：部署脚本默认镜像拉取次数从 3 次提高到 8 次，继续使用逐次增加 5 秒的退避间隔；拉取完成前不会切换现有容器，因此网络失败不会影响当前健康版本。
- 机器侧操作：无需修改 `.env`；重新执行 `Build and deploy`，Runner 会覆盖安装新版部署脚本并继续拉取同一提交 SHA 对应镜像。

### 验证

```bash
sh -n deploy/deploy.sh
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
```

预期网络短暂 EOF 时会继续重试，成功后容器镜像切换到目标 SHA 且状态为 `healthy`。

### 回滚

- 将 `PULL_ATTEMPTS` 默认值恢复为 3，或在机器侧临时设置 `PULL_ATTEMPTS=3`；不涉及数据库、Redis、Nacos 或业务数据回滚。
- 若全部重试仍失败，保持当前健康容器不变，待 GHCR 链路恢复后重新执行流水线。

## 2026-08-18：同机 Redis 认证自动传递

- 影响范围：Company、Home 账号服务自动部署；重点修复 Home Redis 已启用密码、Account `.env` 未同步密码时的新镜像健康检查失败。
- 关联版本：账号服务本次 Redis 部署兼容提交；`@wlisfes/chat-web-base-schema@1.0.6`。
- 变更内容：容器显式环境变量改为优先于同名 Nacos 远端键，空环境值也表示明确覆盖；Nacos 启动日志只记录键名。Redis 启动日志只记录 URL/Host 来源、是否认证、TLS 和库号；部署脚本固定同机 Redis 后会校验新容器实际收到的 Host、URL 和密码是否与受保护 `.env` 一致，只比较且不输出，不一致立即回滚。已带密码的 `REDIS_URL` 保持优先；URL 只有主机或用户名、另有 `REDIS_PASSWORD` 时由应用合并认证信息。仅当 Redis 目标能匹配同机容器名称、旧短 ID、当前容器地址或网络别名、Account 未显式配置密码时，部署脚本才使用目标容器在账号服务 Docker 网络上的当前 IPv4 地址执行 RESP3 `PING`，并要求实际响应精确等于 `PONG`，不再只检查 `redis-cli` 退出码，从而避免服务端返回 `NOAUTH` 但客户端退出码仍为 0 的假阳性；此检查与 Node Redis 6 的 `HELLO 3` 握手一致，并绕过重复网络别名和客户端 DNS 差异。验证通过后，脚本以 `0600` 权限原子更新机器侧 `.env` 的 `REDIS_HOST` 并清空旧的未认证 `REDIS_URL`；Redis 重建后的下次部署会自动刷新地址。要求认证时，从 Redis 容器环境键或独立 `--requirepass` 参数读取密码，经过认证的 RESP3 命令同样必须精确返回 `PONG`，随后只写入受保护的机器侧 `.env`。各分支只记录不含地址和密码的判定结果；地址值和密码不写入日志或 GitHub，密码也不写入仓库或最终镜像。远程 Redis、ACL 文件和自定义配置文件保持显式配置模式。
- 机器侧操作：无需人工复制现有同机 Redis 密码；重新执行 `Build and deploy`，脚本会自动维护 `/opt/chat-web-account-service/.env` 中的本机 Redis 路由和认证信息。若部署日志报告未找到受支持的凭据来源，应在机器侧安全配置该文件，不得把密码写入 Actions 命令、文档或提交。

### 验证

```bash
sh -n deploy/deploy.sh
docker exec chat-web-redis redis-cli ping
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
```

无密码 Redis 预期匿名 RESP3 `PING` 返回 `PONG`；要求认证的 Redis 预期匿名 RESP3 检查失败但部署日志显示本地凭据验证成功，最终容器为 `healthy`，`/health` 中 `redis.connected` 为 `true`。Home 将健康检查端口改为 `3001`。

### 回滚

- 回滚到上一版账号服务提交和镜像；如需恢复共享别名，可在机器侧把 `REDIS_HOST` 改回 `chat-web-redis` 并删除空 `REDIS_URL` 行，禁止复制或输出密码。
- 数据库 Schema、Redis 数据和 Redis 密码均不变，无需数据回滚。

## 2026-08-18：HTTP 业务异常改用响应体状态码

- 影响范围：Company、Home 账号服务及管理端 API 调用。
- 关联版本：账号服务本次统一响应兼容提交；`@wlisfes/chat-web-base-schema@1.0.6`。
- 变更内容：账号服务改为导入共享 `HttpResponseModule` 并删除本地重复 filter/interceptor；HTTP JSON 业务异常的传输状态统一为 `200`，真实业务状态写入 `{ data, code, message, timestamp }` 的 `code`；SVG 等原始响应不受影响，`/health`、`/health/ready` 使用 `@PreserveHttpStatus()` 保留原生错误状态供 Docker 判定健康。
- 机器侧操作：构建并滚动替换账号服务镜像；Docker 构建使用临时 `GITHUB_TOKEN` 查询固定版本的 GitHub Packages tarball 地址并继续冻结锁文件安装，Token 和下载地址不写入仓库或最终镜像；端口、Nacos、Redis、数据库和环境变量均不变。

### 验证

```bash
yarn test
curl -i http://127.0.0.1:3000/auth/me
```

未携带 Token 时预期 HTTP 状态为 `200`，响应体 `code` 为 `401`；服务日志仍记录原始业务状态。

### 回滚

- 回滚到上一版账号服务镜像；无需回滚数据库、Redis 或 Nacos 配置。

## 2026-08-18：旧平台账号、组织、角色和菜单数据迁移工具

- 影响范围：Company 账号数据库；Home 不导入 Company 业务数据。
- 关联版本：账号服务本次旧平台迁移提交；源转储 SHA-256 `5CBA81FE63CF4BF78E5ABD36AE1ACF11C8ED71FD5D207DA0CCCA83FDF3543E50`。
- 容器与端口：服务端口不变；迁移 CLI 在账号服务构建产物 `dist/cli` 中运行。
- Nacos 与网络：沿用 `database.chat-web-account`；旧数据先进入同一 MySQL 实例的独立 staging 库。

### 变更内容

- 新增默认回滚、显式 `--apply` 才提交的旧平台数据迁移 CLI。
- 旧用户 UID 保留，其他旧 19 位业务 ID 只用于建立自增 `key_id` 映射，不写入目标主键。
- 旧 bcrypt 密码统一改为不可登录的随机重置标记；初始超级管理员使用单独生成的 `scrypt-v1` 哈希。
- 部门角色映射为对应组织及其子组织的 `CUSTOM` 数据范围；双部门用户保留两条组织和角色关系，并确定一个主组织。
- 旧菜单路径映射到当前管理端路由，未实现页面默认隐藏；补齐账号、组织、角色和菜单管理接口所需权限码。
- 一个重复邮箱按旧记录顺序保留首条，其余置空，避免目标唯一索引冲突。

### 机器侧操作

1. 在 Company 备份当前账号库，并确认备份文件可读。
2. 把旧转储导入独立 staging 库，先运行默认 dry-run 并核对汇总数量。
3. 通过安全渠道指定旧工号和离线生成的初始管理员密码哈希，再使用 `--apply` 提交。
4. 验证完成后删除 staging 库；禁止在文档、Actions 或完整 `.env` 中保存初始密码和密码哈希。

### 验证

```bash
LEGACY_MYSQL_DATABASE=legacy_platform_20260818 yarn legacy:migrate
curl -fsS http://127.0.0.1:3000/health
docker logs --tail 100 chat-web-account-service
```

本次源数据干跑预期：491 用户、53 组织、178 组织闭包、53 角色、52 数据范围、3 用户组织关系、4 用户角色关系、29 菜单/权限节点。dry-run 后目标库仍应保持 0 用户、0 组织、0 菜单和 1 个内置角色。

### Company 实际执行结果

- 2026-08-18 已在 Company 当前账号库完成迁移；执行时短暂停止 `chat-web-account-service`，事务提交后恢复原容器。正式容器仍使用镜像 `ghcr.io/wlisfes/chat-web-account-service:1bba9dd1af3f9d2eb8a950360260906f366660e0`，状态为 `healthy`。
- 迁移前备份位于 `C:\Users\Administrator\Downloads\chat-web-account-before-legacy-import-20260818-094538.sql`，大小 21871 bytes，SHA-256 为 `6105F6854449AE51FDB58F4C551DA9C7FACFCA6304A3DE91D7AA5BF3F077217C`。
- 初始管理员按旧工号 `1233` 唯一匹配并授予 `super_admin`；临时密码及其哈希未写入仓库、文档或命令输出。
- 提交后核对结果：491 用户、53 组织、178 组织闭包、53 角色、52 数据范围及组织授权、3 用户组织关系、4 用户角色关系、29 菜单/权限节点；490 个账号处于密码待重置状态，1 个账号使用 `scrypt-v1`，`account:*` 权限码 19 个，关联孤儿总数为 0。
- 使用当前本地构建产物在 `127.0.0.1:3001` 启动一次性验证容器，并关闭 Nacos 服务注册。验证码 Cookie 与 Redis、`1233` 登录、`permissions/me.superAdmin`、退出登录及旧 Token 返回 HTTP 401 均验证通过；验证容器随后已删除。
- 迁移验证通过后已删除 staging 库 `legacy_platform_20260818`；源压缩包和迁移前目标库备份保留在机器侧。

### 回滚

- dry-run 始终回滚，无需数据回滚。
- 正式提交后若验证失败，停止账号服务写入，删除或重建目标账号库并恢复迁移前备份。
- 不要把旧转储直接恢复到目标库；旧转储包含 `DROP TABLE tb_system_*`，只允许用于 staging。

## 2026-08-18：登录授权接入 Redis 会话与验证码

- 影响范围：Company、Home。
- 关联版本：账号服务本次登录授权提交；前端 `chat-web-base-manager` 对接版本。
- 容器与端口：账号服务端口保持 `3000`；新增依赖基础设施容器 `chat-web-redis:6379`。
- Nacos 与网络：Nacos 路由不变；Account 与 Redis 必须同时加入 `chat-web-infrastructure`。

### 变更内容

- Redis 用于3分钟图形验证码和可撤销 JWT 登录会话，Token 续期时原会话会被轮换删除，主动退出会立即撤销会话。
- 新增 `/auth/captcha`、`/auth/refresh`、`/auth/logout`；`/auth/me` 返回完整当前用户信息。
- 验证码 SVG 明确禁止浏览器和网关缓存，SID Cookie 固定为根路径；登录、续期和退出接口统一返回 HTTP 200，兼容管理端既有响应约定。
- HTTP JSON 响应兼容管理端原有 `{ data, code, message, timestamp }` 格式；后续版本将业务异常传输状态统一为 HTTP 200，由响应体 `code` 表达结果。
- `/health` 新增 Redis `PING` 就绪检查；Redis 不可用时容器不会进入健康状态。

### 机器侧操作

1. 确认每台机器的 `chat-web-redis` 正常运行并加入 `chat-web-infrastructure`。
2. 无密码的现有基础设施不需修改 `.env`；启用 ACL、密码或 TLS 时设置对应 `REDIS_USERNAME`、`REDIS_PASSWORD` 或 `REDIS_URL`。
3. 不要在 Git、Actions 日志或文档中记录真实 Redis 密码和完整连接串。

### 验证

```bash
docker exec chat-web-redis redis-cli ping
docker inspect chat-web-account-service --format '{{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
curl -I http://127.0.0.1:3000/auth/captcha
```

正常结果：Redis 返回 `PONG`，容器为 `healthy`，健康检查响应中的 `redis.connected` 为 `true`，验证码接口返回 SVG。

### 回滚

- 回滚到上一条账号服务镜像，并恢复部署前的 compose 和 `.env`；数据库 Schema 不需要回滚。
- 旧镜像不会读取 Redis 会话键，可保留等待 TTL 自动过期，或仅删除 `chat-web:account:session:*` 和 `chat-web:account:captcha:*` 前缀键。
- 不要清空 Redis 中其他服务的数据。

## 2026-08-18：Home Redis 地址改用稳定容器名

- 影响范围：Home 当前 Docker Desktop 主机；Company 配置不变。
- 关联版本：Account 镜像 `1fdd744d4b1519fa427a36065a2dc1beb3753fcc`；Manager 部署联调修复。
- 容器与端口：`chat-web-account-service` 继续使用宿主机 `127.0.0.1:3001`、容器 `3000`。
- Nacos 与网络：Namespace、Data ID、Group 均不变；继续使用 `chat-web-infrastructure`。

### 变更内容与机器侧操作

- 将 Home `/opt/chat-web-account-service/.env` 的 `REDIS_HOST` 从易失的容器 IP 改为 Docker DNS 名 `chat-web-redis`。
- 使用现有 Compose 文件重建 Account 容器，使新环境变量生效；不修改 Redis 数据、密码或 Nacos 配置。
- 原 IP 在基础设施容器重启后已被 MySQL 使用，导致 Account 持续连接错误并使 Gateway 返回业务 502。

### 验证

```powershell
docker inspect chat-web-account-service --format "{{.State.Status}} {{.State.Health.Status}}"
docker exec chat-web-account-service getent hosts chat-web-redis
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/health
Invoke-WebRequest -UseBasicParsing https://chat.lisfes.com/api/account/health
```

预期 Account 为 `running healthy`，Docker DNS 返回当前 Redis 地址，直连及经 Manager/Gateway 的健康检查均返回成功业务体。

### 回滚

- 只有在 `chat-web-redis` 容器名不再存在且已提供另一个稳定 DNS 名时，才将 `REDIS_HOST` 改为新的稳定名称并重建 Account。
- 不要回滚为固定容器 IP；容器重建后 IP 会变化，固定 IP 会再次造成服务不可用。

## 2026-08-17：本地 Docker 数据库初始化与配置示例说明

- 影响范围：Home；文档同步覆盖 Company。
- 关联版本：`developer` 分支本次配置修正；Schema 依赖 `@wlisfes/chat-web-base-schema@1.0.3`。
- 容器与端口：容器和 Nacos 注册端口固定为 `3000`；`.env.example` 的宿主机端口仅为示例，真实端口由各机器 `.env` 管理。
- Nacos 与网络：Namespace ID 使用稳定占位符，不在示例文件中同步机器真实值；继续使用 `chat-web-infrastructure`。

### 变更内容

- 明确 `.env.example` 只用于保证配置项完整，值使用稳定示例或占位符，不随机器运行值变化。
- 补齐本地端口、数据库覆盖项和可选 Nacos 鉴权项，避免复制示例后缺少代码支持的环境变量名称。
- 修正 README 数据库名为实际使用的 `chat-web-account`。
- 明确 Home、Company 的宿主机端口差异，以及容器和 Nacos 注册始终使用 `3000`。
- 本地基础设施为全新 MySQL 数据卷增加 `chat-web-account` 数据库初始化 SQL；表结构仍由 Schema 包增量 SQL 创建，TypeORM 不自动建表。

### 机器侧操作

1. 现有 MySQL 数据卷已经包含账号库，无需删除或重建，也不会重新执行初始化 SQL。
2. 各机器继续使用 `/opt/chat-web-account-service/.env` 中自己的 Namespace ID 和宿主机端口，不要从 `.env.example` 自动覆盖真实值。
3. 新机器首次启动空 MySQL 数据卷时，先确认基础设施初始化 SQL 已挂载，再运行账号服务部署器应用 Schema 增量 SQL。

### 验证

```bash
IMAGE=chat-web-account-service:local docker compose -f deploy/compose.yml --env-file deploy/.env.example config
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3001/health
docker exec -it chat-web-mysql mysql -uroot -p -e "SHOW DATABASES LIKE 'chat-web-account';"
```

Home 健康检查应返回 HTTP 200；Company 将验证命令端口改为 `3000`。数据库查询应返回 `chat-web-account`。

### 回滚

- 将两份环境变量示例和 README 恢复为变更前内容；真实服务器 `.env` 不随文档回滚。
- 可移除基础设施的初始化 SQL 挂载；它只在空数据目录初始化时执行，移除不会删除现有数据库。
- 不要为了回滚文档或初始化配置而删除现有 MySQL 数据卷。

## 2026-08-17：RBAC 关联字段统一使用自增主键

- 影响范围：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.0.3`；账号服务本次修复版本。
- 容器与端口：服务名、容器名和 `3000` 端口保持不变。
- Nacos 与网络：配置结构、Data ID、数据库地址和 Docker 网络保持不变。

### 变更内容

- `uid` 仅保留在 `tb_account_user`，继续作为账号业务标识和 JWT subject。
- 组织、菜单、角色和数据范围规则直接使用各表自增 `key_id`；全部内部关联改为 `*_key_id`。
- 新增 `20260817205000__tb_account_organization__use_key_ids.sql`，升级时按旧 UID 映射现有父子关系、成员关系、角色菜单和数据范围后删除旧字段。
- 组织、菜单、角色相关 HTTP 路径参数和请求体同步改为数值型 `keyId`。

### 机器侧操作

1. 部署前保留账号数据库备份；该迁移会删除非用户表的旧 UID 字段，属于不可直接逆向的 DDL。
2. 正常合并到 `master` 后由部署器自动执行增量 SQL，不要人工修改已经发布的历史迁移文件。
3. 部署后使用 `information_schema.columns` 确认名为 `uid` 的业务列只剩 `tb_account_user.uid`。

### 验证

```bash
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
docker logs --tail 100 chat-web-account-service
```

数据库验证应确认旧关联列为 0 个，并且 UID 业务列只剩用户表：

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE() AND column_name = 'uid';

SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND column_name IN ('parent_uid', 'ancestor_uid', 'descendant_uid', 'organization_uid', 'role_uid', 'menu_uid', 'data_scope_uid');
```

### 回滚

- 不能只回滚到旧服务镜像：旧镜像依赖已经删除的 UID 关联列。
- 若切换失败且必须回退，先恢复迁移前数据库备份，再恢复上一条已验证镜像。
- 若新版本已经写入业务数据，优先发布前向修复；不要直接恢复旧备份覆盖新增数据。

## 2026-08-17：组织架构、RBAC 与数据权限运行配置

- 影响范围：Company、Home。
- 关联版本：`developer` 分支本次功能提交；依赖 `@wlisfes/chat-web-base-schema@1.0.2`。
- 容器与端口：保持 `chat-web-account-service`、宿主机及容器端口 `3000` 不变。
- Nacos：原数据库和服务发现配置保持不变，新增可选的 `security.jwt` 配置节点。

### 变更内容

- 新增组织架构、系统菜单、角色、菜单权限、用户组织/角色关系和跨部门数据范围功能。
- 除首页、健康检查和登录接口外，账号服务默认校验 Bearer Token。
- JWT 使用 HS256；密钥读取 `JWT_SECRET`，未设置时读取 Nacos `security.jwt.secret`，长度至少32位。
- 新增9张权限相关表；数据库仍由外部 SQL 创建或升级，TypeORM 不自动建表。
- `/health` 和 `/health/ready` 新增数据库必需表及 JWT 密钥检查；缺表或密钥无效时返回 HTTP 503，Docker 部署会自动回滚。`/health/live` 仅检查进程存活。
- 双机部署从各自 GitHub Environment 的 `JWT_SECRET` Secret 同步运行密钥，并在切换容器前自动运行带文件校验和及执行账本的 Schema 升级器。

### 机器侧操作

1. 在 `production-company`、`production-home` GitHub Environment 中设置相同的 `JWT_SECRET` Secret；部署任务会安全同步到各机器 `/opt/chat-web-account-service/.env`。
2. 自动部署会按文件名执行共享 Schema 包 `sql/changes/20260817170000` 至 `20260817170010`；首次接入自动建立 `tb_account_schema_migration` 执行账本。Company 已人工应用本次 SQL，部署器会幂等复核并补记账本。
3. 为初始管理员账号分配编码为 `super_admin` 的启用角色，再开放管理接口。
4. 不要把真实 JWT 密钥、密码哈希或完整 `.env` 提交到仓库。

首个账号的密码哈希可在可信开发机使用 `yarn password:hash` 离线生成，具体初始化 SQL 见 `deploy/README.md`。

### 验证

```bash
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/organizations/tree
docker logs --tail 100 chat-web-account-service
```

正常结果：容器为 `healthy`，健康检查返回 HTTP 200，未携带 Token 访问组织接口返回 HTTP 401，登录后按角色返回 HTTP 200 或 403。

若健康检查返回 HTTP 503 并列出 `missingTables`，说明增量 SQL 未完整应用，不能跳过检查继续部署。

### 回滚

- 将服务镜像回滚到变更前 SHA，并恢复部署前的 Nacos JWT 配置或服务器 `.env`。
- 新增表在旧版本中不会被访问，可暂时保留；确认无新版本业务数据后再由数据库管理员备份并删除。
- 不要回滚或重复执行已经成功应用的增量 SQL 文件。

## 2026-08-17：双机器部署、Nacos 注册与数据库连接修复

- 影响范围：Company、Home。
- 关联代码：`developer` 分支 `d8336b2`；当前已部署的 `master` 镜像为 `56e470ee15aa7b4e26c41b0b0b36df9aaa8402a7`。
- 容器与端口：`chat-web-account-service`，宿主机 `3000`，容器 `3000`。
- 部署目录：`/opt/chat-web-account-service`。
- Docker 网络：`chat-web-infrastructure`。
- Nacos：Data ID `chat-web-account-service.yaml`，Group `DEFAULT_GROUP`，Namespace 名称 `chat-web-service`。

### 变更内容

- Docker 镜像拉取失败时最多重试 3 次。
- 显式声明 Express 5，满足 `@wlisfes/chat-web-base-schema` 的 peer dependency。
- 增加 Account 服务的 Nacos 注册、退出注销和 Nest 关闭钩子。
- Nacos 中 MySQL 主机不能使用 `127.0.0.1`；Docker 环境改为 `chat-web-mysql`。
- Company Runner 服务恢复并完成 SHA 镜像部署。
- 明确不同仓库必须安装独立 Self-hosted Runner。

### 机器侧状态与动作

- Company：Nacos MySQL 主机已改为 `chat-web-mysql`；Runner 服务为 `actions.runner.Wlisfes-chat-web-account-service.chat-server-company.service`。
- Home：合并部署前确认本机 `.env` 指向本机 `chat-web-service` Namespace；确认 Nacos MySQL 主机使用本机 Docker 网络中的 MySQL 容器名，不能使用 `127.0.0.1`。
- 两台机器的真实 `.env` 只保存在 `/opt/chat-web-account-service/.env`，不得提交。

### 验证

```bash
docker inspect chat-web-account-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3000/health
docker logs --tail 100 chat-web-account-service
```

正常结果：容器为 `healthy`，健康检查返回 HTTP 200，日志中不再出现 `ECONNREFUSED 127.0.0.1:3306`。

### 回滚

- Actions 部署脚本会在健康检查失败时自动恢复部署前镜像。
- 手动恢复时，将 `/opt/chat-web-account-service/compose.yml` 的 `IMAGE` 指向上一条已验证 SHA 后执行 `docker compose up -d --no-deps account-service`。
- 不要把 Docker 环境的 MySQL 主机回滚为 `127.0.0.1`。

## 记录模板

```markdown
## YYYY-MM-DD：变更标题

- 影响范围：Company / Home / 全部。
- 关联版本：分支、提交 SHA、镜像 SHA。
- 变更内容：
- 机器侧操作：
- 验证：
- 回滚：
```
