# 部署变更记录

本文件只记录会影响服务器构建、部署、启动或运行的变更，不记录密码、Token、私钥和真实 `.env`。

新增记录必须包含：影响范围、关联版本、变更内容、机器侧操作、验证方式和回滚方式。最新记录放在最前面。

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
