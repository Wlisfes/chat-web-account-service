# 部署变更记录

本文件只记录会影响服务器构建、部署、启动或运行的变更，不记录密码、Token、私钥和真实 `.env`。

新增记录必须包含：影响范围、关联版本、变更内容、机器侧操作、验证方式和回滚方式。最新记录放在最前面。

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
