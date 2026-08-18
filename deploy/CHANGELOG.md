# 部署变更记录

本文件只记录会影响服务器构建、部署、启动或运行的变更，不记录密码、Token、私钥和真实 `.env`。

新增记录必须包含：影响范围、关联版本、变更内容、机器侧操作、验证方式和回滚方式。最新记录放在最前面。

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
