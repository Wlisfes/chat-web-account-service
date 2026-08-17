# Account 服务部署与故障恢复手册

## 当前基线

| 项目 | 值 |
| --- | --- |
| 容器 | `chat-web-account-service` |
| 访问地址 | `http://127.0.0.1:3000` |
| 健康检查 | `http://127.0.0.1:3000/health` |
| 部署目录 | `/opt/chat-web-account-service` |
| Docker 网络 | `chat-web-infrastructure` |
| Nacos Data ID | `chat-web-account-service.yaml` |
| Nacos Group | `DEFAULT_GROUP` |
| Nacos Namespace 名称 | `chat-web-service` |
| Nacos 服务名 | `chat-web-account-service` |
| Company Runner 标签 | `chat-server-company` |
| Home Runner 标签 | `chat-server-home` |

Namespace ID 是每台 Nacos 的运行参数。恢复机器时先在 Nacos 控制台确认 `chat-web-service` 的实际 ID，再填写服务器 `.env`，不要根据另一台机器猜测。

## 五分钟排障

### 1. 检查容器与访问

```powershell
docker ps -a --filter "name=chat-web-account-service"
docker inspect chat-web-account-service --format "{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}"
docker logs --tail 200 chat-web-account-service
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/health
```

### 2. 检查基础设施网络

```powershell
docker network inspect chat-web-infrastructure
docker ps --filter "name=chat-web-mysql" --filter "name=chat-web-nacos"
```

Account、MySQL、Nacos 必须加入 `chat-web-infrastructure`。Nacos 数据库配置的主机应为 `chat-web-mysql`，不能是 `127.0.0.1`。

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

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Actions 长时间 Queued | 对应机器 Runner 离线 | 启动 WSL 保活任务并重启 Runner 服务 |
| `ECONNREFUSED 127.0.0.1:3306` | 容器把自身当成 MySQL | 将 Nacos MySQL 主机改成 `chat-web-mysql` |
| Nacos 配置不存在 | Namespace ID、Data ID 或 Group 不一致 | 核对服务器 `.env` 和 Nacos 控制台 |
| 新镜像不健康 | 数据库、Nacos或启动代码失败 | 查看容器日志；部署脚本会自动回滚 |
| 3000 无法访问 | 容器未健康或端口未映射 | 检查 Compose、容器状态和 `HOST_PORT` |

## 恢复顺序

1. 启动 Docker Desktop 和基础设施容器。
2. 确认 `chat-web-infrastructure` 网络存在。
3. 确认 `/opt/chat-web-account-service/.env` 中只包含本机部署参数和 Nacos 启动参数。
4. 启动 WSL 保活任务和 Account Runner。
5. 在 GitHub Actions 手动运行当前稳定分支的 `Build and deploy`。
6. 验证镜像 SHA、容器健康和 `/health`。

每次处理完成后，把新原因和恢复命令补充到 `deploy/CHANGELOG.md`。
