# Repository instructions

## 单机部署规则

- 本服务只部署到当前主机 `chat-home-server`，原另一台部署机器已废弃并下线，不得再为废弃机器创建部署任务或多机矩阵。
- GitHub Actions 使用 `chat-home-server` Runner 标签和 `production-home` Environment，只构建一次完整 Git SHA 镜像并部署到 `/opt/chat-web-account-service`。
- 本仓库使用独立 Self-hosted Runner；部署必须包含健康检查、部署后验证和失败自动回滚，不得使用 `--remove-orphans`。

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

## 服务数据边界

- 本服务独占 MySQL 数据库 `chat_web_account`，运行与 Schema 升级账号只能访问 `chat_web_account.*`，不得拥有全局权限、其他业务库权限或跨库角色；数据库必须由外部基础设施预创建。
- 本服务独占 Redis index `0`，登录会话、验证码和缓存不得写入其他 index。
- 本服务是身份与会话的唯一所有者。其他服务只能通过 `/auth/token/introspect` 等强类型 HTTP 接口访问身份信息，不得共享 JWT 密钥、数据库 Entity 或 Redis 会话。
- 本服务需要其他业务数据时同样必须使用强类型 HTTP 客户端 Provider，不得连接其他服务数据库或执行跨业务库 SQL。

## 共享 Schema 依赖联动

- 当任务包含 `chat-web-base-schema` 公共能力变更时，Agent 必须自行等待共享包发布，随后将本服务升级到明确的新版本，不得要求用户手动更新依赖。
- 升级后应优先使用共享包导出的实现并删除本地重复代码，运行仓库要求的完整测试，并按部署规则同步变更记录。
- 用户已授权完成该联动任务时，Agent 应自行提交、推送、创建 PR 并合并到默认分支；只有权限、认证、分支保护或持续失败的 CI 确实阻止时才请求用户介入。
