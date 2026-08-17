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
| Nacos Data ID        | `chat-web-account-service.yaml` |
| Nacos Group          | `DEFAULT_GROUP`                 |
| Nacos Namespace 名称 | `chat-web-service`              |
| Nacos 服务名         | `chat-web-account-service`      |
| Company Runner 标签  | `chat-server-company`           |
| Home Runner 标签     | `chat-server-home`              |

`.env.example` 中的值只是示例，不代表任何机器的运行基线。Namespace ID 是每台 Nacos 的运行参数；恢复机器时先在 Nacos 控制台确认 `chat-web-service` 的实际 ID，再填写服务器 `.env`，不要根据示例或另一台机器猜测。

`/health/live` 只表示进程存活；Docker 使用的 `/health` 会同时检查数据库连接、账号服务全部必需表和 JWT 密钥。返回 503 时，根据 `missingTables` 和 `security.jwtConfigured` 检查增量 SQL及密钥配置，不要绕过健康检查。

自动部署会在启动新容器前运行 `dist/cli/apply-schema.js`。执行记录保存在账号库 `tb_account_schema_migration`；若日志提示校验和变化，说明已发布的历史 SQL 被修改，必须恢复原文件并重新构建，不能直接改数据库记录绕过检查。

本地基础设施首次使用全新 MySQL 数据卷时，必须先创建 `chat-web-account` 数据库，再运行 Schema 升级器。MySQL 官方镜像只会在空数据目录执行 `/docker-entrypoint-initdb.d` 中的 SQL；给已有数据卷补挂初始化脚本不会重复执行，也不能替代 Schema 增量 SQL。TypeORM 必须继续保持 `synchronize: false` 和 `migrationsRun: false`。

## 五分钟排障

### 1. 检查容器与访问

```powershell
docker ps -a --filter "name=chat-web-account-service"
docker inspect chat-web-account-service --format "{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}"
docker logs --tail 200 chat-web-account-service
$accountPort = 3001 # Home；Company 改为 3000
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$accountPort/health"
```

### 2. 检查基础设施网络

```powershell
docker network inspect chat-web-infrastructure
docker ps --filter "name=chat-web-mysql" --filter "name=chat-web-nacos"
```

Account、MySQL、Nacos 必须加入 `chat-web-infrastructure`。Nacos 数据库配置的主机应为 `chat-web-mysql`，不能是 `127.0.0.1`。

全新 MySQL 数据卷还必须确认账号数据库已由基础设施初始化脚本创建：

```powershell
docker exec -it chat-web-mysql mysql -uroot -p -e "SHOW DATABASES LIKE 'chat-web-account';"
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

| 现象                          | 原因                                  | 处理                                                 |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Actions 长时间 Queued         | 对应机器 Runner 离线                  | 启动 WSL 保活任务并重启 Runner 服务                  |
| `ECONNREFUSED 127.0.0.1:3306` | 容器把自身当成 MySQL                  | 将 Nacos MySQL 主机改成 `chat-web-mysql`             |
| Nacos 配置不存在              | Namespace ID、Data ID 或 Group 不一致 | 核对服务器 `.env` 和 Nacos 控制台                    |
| 新镜像不健康                  | 数据库、Nacos或启动代码失败           | 查看容器日志；部署脚本会自动回滚                     |
| `/health` 返回缺表列表        | 共享 Schema 增量 SQL 尚未执行         | 按文件名顺序应用本次版本 SQL，再重新部署             |
| 宿主机端口无法访问            | 容器未健康或端口未映射                | Home 检查 `3001`，Company 检查 `3000` 和 `HOST_PORT` |

## 恢复顺序

1. 启动 Docker Desktop 和基础设施容器。
2. 确认 `chat-web-infrastructure` 网络存在。
3. 确认 MySQL 中存在 `chat-web-account` 数据库；全新数据卷应由基础设施初始化 SQL 创建。
4. 确认 `/opt/chat-web-account-service/.env` 中只包含本机部署参数和 Nacos 启动参数；Home 使用 `HOST_PORT=3001`，Company 使用 `HOST_PORT=3000`。
5. 启动 WSL 保活任务和 Account Runner。
6. 在 GitHub Actions 手动运行当前稳定分支的 `Build and deploy`。
7. 验证镜像 SHA、容器健康和 `/health`。

每次处理完成后，把新原因和恢复命令补充到 `deploy/CHANGELOG.md`。
