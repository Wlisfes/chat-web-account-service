# Account 服务部署与故障恢复手册

## 当前基线

| 项目                 | 值                              |
| -------------------- | ------------------------------- |
| 容器                 | `chat-web-account-service`      |
| Home 访问地址        | `http://127.0.0.1:3001`         |
| Home 健康检查        | `http://127.0.0.1:3001/health`  |
| Company 访问地址     | `http://127.0.0.1:3000`         |
| Company 健康检查     | `http://127.0.0.1:3000/health`  |
| 容器/Nacos 注册端口  | `3000`                          |
| 部署目录             | `/opt/chat-web-account-service` |
| Docker 网络          | `chat-web-infrastructure`       |
| 数据库               | `chat_web_account`              |
| MySQL 授权边界       | 仅 `chat_web_account.*`         |
| Redis 容器           | `chat-web-redis`                |
| Redis index          | `0`                             |
| Nacos Data ID        | `chat-web-account-service.yaml` |
| Nacos Group          | `DEFAULT_GROUP`                 |
| Nacos Namespace 名称 | `chat-web-service`              |
| Nacos 服务名         | `chat-web-account-service`      |
| Company Runner 标签  | `chat-server-company`           |
| Home Runner 标签     | `chat-server-home`              |

`.env.example` 中的值只是示例，不代表任何机器的运行基线。Namespace ID 是每台 Nacos 的运行参数；恢复机器时先在 Nacos 控制台确认 `chat-web-service` 的实际 ID，再填写服务器 `.env`，不要根据示例或另一台机器猜测。

配置优先级为容器显式环境变量高于 Nacos 远端配置。Nacos 仍负责数据库等未在环境中指定的配置；同名环境键即使值为空也表示明确覆盖，例如部署脚本用空 `REDIS_URL` 清除旧远端 URL、再通过唯一 `REDIS_HOST` 固定同机容器。启动日志只记录已应用和被环境覆盖的键名，不记录值。

Redis 启动日志仅记录配置来源（URL 或 Host）、是否配置认证、TLS 状态和数据库编号，不记录地址、用户名或密码。部署脚本固定同机 Redis 时，还会比较受保护 `.env` 与新容器实际收到的 `REDIS_HOST/REDIS_URL/REDIS_PASSWORD`；只比较值且不输出，不一致会在健康检查前回滚。

`/health/live` 只表示进程存活；Docker 使用的 `/health` 会同时检查数据库连接、账号服务全部必需表、Redis 会话存储和 JWT 密钥。返回 503 时，根据 `missingTables`、`redis.connected` 和 `security.jwtConfigured` 检查基础设施、增量 SQL 及密钥配置，不要绕过健康检查。

外部客户主表为 `tb_account_consumer`，服务内部管理接口为 `/consumer/**`，经 Gateway 公开为 `/api/account/consumer/**`。该表属于账号域；Finance 数据库中的 `tb_finance_client*` 由 Schema 增量直接删除，不得恢复业务写入。

自动部署会在启动新容器前运行 `dist/cli/apply-schema.js`。执行记录保存在账号库 `tb_account_schema_migration`；若日志提示校验和变化，说明已发布的历史 SQL 被修改，必须恢复原文件并重新构建，不能直接改数据库记录绕过检查。

部署会在 Schema 升级前运行幂等隔离器，分别检查 Account 与 Finance 当前 Nacos 数据库账号。除 MySQL 固定的 `USAGE ON *.*` 外，只允许账号拥有本服务数据库权限；发现旧全局账号时会在进程内生成随机专用凭据、只授权 `chat_web_account.*` / `chat_web_finance.*`、回写各自 Nacos 并复连验证。密码不输出、不写仓库。隔离完成后 Schema 升级器再次执行 `SHOW GRANTS FOR CURRENT_USER()`，全局权限、其他业务库权限和角色授权都会让部署在切换容器前失败。数据库必须由基础设施预创建，升级器不会执行 `CREATE DATABASE`。

新环境数据库名统一使用下划线形式。为兼容 Home 的历史数据卷，隔离器也接受现有 `chat-web-account` / `chat-web-finance`，并按 Nacos 中的实际数据库名授权；部署不会在线重命名数据库。

核对命令在使用本服务连接参数进入 MySQL 后执行：

```sql
SELECT DATABASE(), CURRENT_USER();
SHOW GRANTS FOR CURRENT_USER();
```

预期当前数据库为 `chat_web_account`，授权目标仅包含 `chat_web_account`。Account 独占 Redis index `0`；`/auth/token/introspect` 是其他服务获取已验证 `AuthPrincipal` 的内部接口，调用方只转发 Bearer Token，不共享 JWT 密钥或 Redis 会话。

本地基础设施首次使用全新 MySQL 数据卷时，必须先创建 `chat_web_account` 数据库，再运行 Schema 升级器。MySQL 官方镜像只会在空数据目录执行 `/docker-entrypoint-initdb.d` 中的 SQL；给已有数据卷补挂初始化脚本不会重复执行，也不能替代 Schema 增量 SQL。TypeORM 必须继续保持 `synchronize: false` 和 `migrationsRun: false`。

## 旧平台数据迁移

`dist/cli/migrate-legacy-platform.js` 用于把 staging 库中的 `tb_system_*` 数据转换到当前 `tb_account_*` Schema。命令默认执行完整事务后回滚；只有显式传入 `--apply` 才会提交。

安全约束：

- 目标用户、组织、菜单和关联表必须为空，角色表只能包含内置 `super_admin`；不满足时迁移器会拒绝执行。
- 旧表必须先导入独立 staging 库，禁止把旧转储直接导入 `chat_web_account`。
- 正式迁移前必须备份当前账号库，并验证备份可以读取。
- 旧 bcrypt 密码不会迁移。普通账号写入不可登录的随机重置标记，之后由超级管理员逐个重置。
- 初始管理员密码使用 `scripts/hash-password.cjs` 在可信机器离线生成；明文和哈希都不能写入 Git、文档或命令日志。

推荐顺序：

```bash
# 1. 备份目标库；连接参数从机器侧安全配置读取，不写进命令历史。
mysqldump --single-transaction --routines --triggers chat_web_account > account-before-legacy-migration.sql

# 2. 创建 staging 库并导入旧转储。
mysql -e "CREATE DATABASE legacy_platform_20260818 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
unzip -p platform_2026-08-18_09-16-50_mysql_data_HLeCZ.sql.zip | mysql legacy_platform_20260818

# 3. 构建后先干跑。未提供管理员时会使用占位账号完成回滚验证。
yarn build
LEGACY_MYSQL_DATABASE=legacy_platform_20260818 yarn legacy:migrate

# 4. 通过安全输入生成初始管理员哈希，再显式提交。
INITIAL_ADMIN_ACCOUNT='<旧工号>' \
INITIAL_ADMIN_PASSWORD_HASH='<离线生成的 scrypt-v1 哈希>' \
LEGACY_MYSQL_DATABASE=legacy_platform_20260818 \
yarn legacy:migrate --apply
```

迁移完成后的预期基线以本次旧库为准：491 个用户、53 个组织、178 条组织闭包、53 个角色（含内置超级管理员）、52 条部门角色数据范围、3 条用户组织关系、4 条用户角色关系、29 个菜单/权限节点。一个重复邮箱会保留较早记录，另一条置空。

验证完成后删除 staging 库。若迁移提交后验证失败，停止账号服务写入，恢复迁移前备份；不要尝试反向执行旧转储中的 `DROP TABLE`。

## 客户演示数据

`tb_account_consumer.key_id` 的标准起点为 `5181000`。`dist/cli/seed-demo-consumer.js` 使用固定种子生成 120 条可重复验证的客户数据，覆盖客户状态、付款模式、类型、阶段、认证、来源、品牌和币种，并轮询分配到最多 20 个启用账号。数据库中必须至少存在两个启用账号，否则脚本拒绝造数，避免所有客户错误集中到同一归属人。

命令默认 dry-run；仅显式 `--apply` 才提交。生产双机应从 GitHub Actions 手动运行 `Build and deploy` 并勾选 `seedDemoConsumers`，由每台 Runner 在对应容器部署健康后执行：

```bash
docker exec chat-web-account-service node dist/cli/seed-demo-consumer.js
docker exec chat-web-account-service node dist/cli/seed-demo-consumer.js --apply
```

落库后通过本服务数据库连接执行：

```sql
SELECT COUNT(*) AS consumer_count, MIN(key_id) AS min_key_id, MAX(key_id) AS max_key_id FROM tb_account_consumer;
SELECT AUTO_INCREMENT FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tb_account_consumer';
SELECT COUNT(DISTINCT owner_user_uid) AS owner_count FROM tb_account_consumer;
SELECT owner_user_uid, COUNT(*) AS consumer_count FROM tb_account_consumer GROUP BY owner_user_uid ORDER BY consumer_count DESC, owner_user_uid;
```

再次执行 `--apply` 时预期 `pending=0`、`inserted=0`。演示客户 UID 和邮箱使用固定保留区间，禁止把该脚本用于真实客户批量导入。

## 五分钟排障

### 1. 检查容器与访问

```powershell
docker ps -a --filter "name=chat-web-account-service"
docker inspect chat-web-account-service --format "{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}"
docker inspect chat-web-account-service --format "{{json .HostConfig.LogConfig}}"
docker logs --tail 200 chat-web-account-service
$accountPort = 3001 # Home；Company 改为 3000
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$accountPort/health"
```

日志配置预期为 `json-file`、`max-size=20m`、`max-file=30`。请求日志应包含 `logId`、方法、URL、状态码和耗时；登录请求中的密码、验证码和 Token 必须显示为 `[已隐藏]`。

### 2. 检查基础设施网络

```powershell
docker network inspect chat-web-infrastructure
docker ps --filter "name=chat-web-mysql" --filter "name=chat-web-nacos" --filter "name=chat-web-redis"
docker exec chat-web-redis redis-cli ping
```

Account、MySQL、Redis、Nacos 必须加入 `chat-web-infrastructure`。Nacos 数据库配置的主机应为 `chat-web-mysql`，Redis 主机应为 `chat-web-redis`，不能是 `127.0.0.1`。

部署脚本始终优先使用账号服务 `.env` 中显式配置的认证信息。`REDIS_URL` 已带密码时保持原值；URL 只有主机或用户名、另有 `REDIS_PASSWORD` 时，应用会安全合并两者。当目标能匹配同机 Redis 容器名称、旧短 ID、当前容器地址或网络别名、Account 未配置密码时，脚本使用该容器在账号服务 Docker 网络上的当前 IPv4 地址执行 RESP3 `PING`，并要求命令输出精确等于 `PONG`，不能只根据 `redis-cli` 进程退出码判断；这与 Node Redis 6 的 `HELLO 3` 握手一致，避免服务端返回 `NOAUTH` 但客户端退出码仍为 0 的假阳性，同时完全绕过重复别名和客户端 DNS 差异。验证通过后，脚本原子更新部署目录 `.env` 中的 `REDIS_HOST` 并清空旧的未认证 `REDIS_URL`，文件权限固定为 `0600`；Redis 容器重建导致地址变化时，下次部署会自动刷新。目标要求认证时，脚本从 Redis 容器的 `REDIS_PASSWORD`、`REDIS_PASS`、`REDISCLI_AUTH` 环境键或独立的 `--requirepass` 启动参数中读取密码，要求经过认证的 RESP3 命令同样精确返回 `PONG` 后才安全写入机器侧 `.env`。地址值和密码都不会输出到日志或上传 GitHub，密码也不写入仓库。ACL 文件、自定义配置文件或远程 Redis 不执行自动读取，必须继续使用机器侧 `.env` 的显式配置。

全新 MySQL 数据卷还必须确认账号数据库已由基础设施初始化脚本创建：

```powershell
docker exec -it chat-web-mysql mysql -uroot -p -e "SHOW DATABASES LIKE 'chat_web_account';"
```

数据库不存在时先修复基础设施初始化配置，再部署账号服务；不要开启 TypeORM 自动建库或自动建表。

### 3. 检查 Company Runner

```powershell
wsl -d Ubuntu-22.04 -u root -- systemctl status actions.runner.Wlisfes-chat-web-account-service.chat-server-company.service
Get-ScheduledTask -TaskName "Chat Web GitHub Runner Company"
```

Runner 服务不是 `active` 时：

```powershell
wsl -d Ubuntu-22.04 -u root -- systemctl restart actions.runner.Wlisfes-chat-web-account-service.chat-server-company.service
Start-ScheduledTask -TaskName "Chat Web GitHub Runner Company"
```

### 4. 检查部署结果

Actions 应满足：Build 成功、Home 与 Company 各自成功。容器镜像标签必须等于本次提交的完整 Git SHA，不能只根据 `latest` 判断版本。

## 常见故障

| 现象                          | 原因                                  | 处理                                                                                         |
| ----------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Actions 长时间 Queued         | 对应机器 Runner 离线                  | 启动 WSL 保活任务并重启 Runner 服务                                                          |
| `ECONNREFUSED 127.0.0.1:3306` | 容器把自身当成 MySQL                  | 将 Nacos MySQL 主机改成 `chat-web-mysql`                                                     |
| Nacos 配置不存在              | Namespace ID、Data ID 或 Group 不一致 | 核对服务器 `.env` 和 Nacos 控制台                                                            |
| 新镜像不健康                  | 数据库、Nacos或启动代码失败           | 查看容器日志；部署脚本会自动回滚                                                             |
| `/health` 返回缺表列表        | 共享 Schema 增量 SQL 尚未执行         | 按文件名顺序应用本次版本 SQL，再重新部署                                                     |
| `/health` 显示 Redis 未连接   | Redis 容器、网络或密码配置错误        | 执行 `redis-cli ping`；同机密码模式核对部署日志中的凭据来源验证，其他模式核对 `REDIS_*` 配置 |
| 宿主机端口无法访问            | 容器未健康或端口未映射                | Home 检查 `3001`，Company 检查 `3000` 和 `HOST_PORT`                                         |

## 恢复顺序

1. 启动 Docker Desktop 和基础设施容器。
2. 确认 `chat-web-infrastructure` 网络存在。
3. 确认 MySQL 中存在 `chat_web_account` 数据库；全新数据卷应由基础设施初始化 SQL 创建。
4. 确认 `/opt/chat-web-account-service/.env` 中只包含本机部署参数和 Nacos 启动参数；Home 使用 `HOST_PORT=3001`，Company 使用 `HOST_PORT=3000`。
5. 启动 WSL 保活任务和 Account Runner。
6. 在 GitHub Actions 手动运行当前稳定分支的 `Build and deploy`。
7. 验证镜像 SHA、容器健康和 `/health`。

每次处理完成后，把新原因和恢复命令补充到 `deploy/CHANGELOG.md`。
