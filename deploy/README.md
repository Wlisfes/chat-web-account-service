# Docker 自动部署

部署基线、故障恢复和跨机器操作记录：

- [部署变更记录](./CHANGELOG.md)
- [故障恢复手册](./RUNBOOK.md)

凡是修改 Docker、Actions、Nacos、端口、环境变量、健康检查或 Runner，必须在同一次提交中更新部署变更记录。

向 `main` 分支直接推送或合并 Pull Request 后，GitHub Actions 会：

1. 构建 Docker 镜像，并以完整 Git SHA 和 `latest` 两个标签推送到 GHCR。
2. 将精确 SHA 镜像投递给 `chat-home-server` 上的仓库专用 Self-hosted Runner。
3. 更新容器并等待 `/health` 健康检查。
4. 健康检查失败时恢复到更新前的镜像。

## 服务器初始化

`chat-home-server` 需要安装 Docker Engine、Docker Compose v2，并允许 Runner 用户执行 `docker`。在仓库的 `Settings -> Actions -> Runners -> New self-hosted runner` 中按照 GitHub 提供的命令安装 Linux Runner，并添加以下自定义标签：

| 服务器             | Runner 标签         | GitHub Environment |
| ------------------ | ------------------- | ------------------ |
| `chat-home-server` | `chat-home-server`  | `production-home`  |

`chat-home-server` 的仓库 Runner 统一作为 Ubuntu WSL 主机上的 systemd 服务运行，不使用 Docker Runner 容器。Account、Finance、CRM、Gateway、Manager 和 Skyline 仍分别注册各自的仓库级 Runner，并使用独立安装目录；同一标签不代表可以跨仓库共用注册实例。

安装 Runner 时使用对应标签，例如：

```bash
./config.sh --url https://github.com/Wlisfes/chat-web-account-service \
  --token GITHUB生成的临时TOKEN \
  --name chat-home-server \
  --labels chat-home-server
sudo ./svc.sh install
sudo ./svc.sh start
```

首次部署前，在 `chat-home-server` 执行：

Self-hosted Runner 默认只属于注册它的仓库。当前 Runner 不能替其他仓库执行部署；同一台机器部署其他服务时，需要在对应仓库的 `Settings -> Actions -> Runners` 中获取新的临时 Token，并使用独立目录再安装一个 Runner 服务。不要让两个仓库共用同一个 Runner 安装目录。

```bash
sudo usermod -aG docker "RUNNER用户"
sudo mkdir -p /opt/chat-web-account-service
sudo chown -R "RUNNER用户":"RUNNER用户" /opt/chat-web-account-service
cd /opt/chat-web-account-service
# 按 deploy/.env.example 创建 .env，并填写实际配置
```

修改 Docker 用户组后，需要重新登录该用户或重启 Runner 服务，并确认 Runner 用户执行 `docker info`、`docker compose version` 均成功。

MySQL、Redis、RabbitMQ、Nacos 等基础服务由独立的基础设施环境管理，不在本业务仓库中启动。部署账号服务前，请确认外部 Docker 网络 `chat-web-infrastructure` 已创建，且账号服务可通过该网络访问 Nacos。业务连接参数统一保存在 Nacos 配置中。

真实 `.env` 只保存在 `chat-home-server`，不上传 GitHub。若需要修改部署目录，请在 `production-home` Environment 中添加 `DEPLOY_PATH` Variable，并在该目录创建 `.env`。

在 `production-home` GitHub Environment 中创建 `JWT_SECRET` Secret，长度至少32位。部署任务会在不输出密钥的前提下同步服务器 `.env`，并在切换容器前使用新镜像中的 Schema 升级器应用尚未执行的增量 SQL。升级器以文件名和 SHA-256 校验和记录执行状态；已经应用的文件不会重复执行，被修改的历史文件会导致部署立即失败。

## 首个超级管理员

增量 SQL 会创建内置 `super_admin` 角色，但不会写入默认账号或默认密码。若数据库还没有管理员：

1. 在可信开发机执行 `yarn password:hash`，终端会隐藏密码输入并只输出 `scrypt-v1` 哈希。
2. 由数据库管理员使用该哈希创建 `tb_account_user` 记录，不要保存明文密码。
3. 根据角色编码关联首个管理员，避免依赖固定角色主键：

```sql
INSERT INTO `tb_account_user_role` (`user_uid`, `role_key_id`)
SELECT '替换为管理员账号UID', `key_id`
FROM `tb_account_role`
WHERE `code` = 'super_admin';
```

完成首次登录并验证权限后，删除终端中的临时哈希和 SQL 操作文件。不要在 Git、Actions 日志或部署文档中记录真实密码及哈希。

## GitHub 配置

不再需要 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS` 和 `DEPLOY_PORT`。Self-hosted Runner 只需主动访问 GitHub 和 `ghcr.io`，不需要开放入站 SSH。

仓库的 Actions `Workflow permissions` 需要允许读写 Packages。若 GHCR 包与仓库没有自动关联，还需在该 Package 的设置中授予本仓库读取权限。

## 废弃机器

原另一台部署机器已废弃并下线。工作流不得再引用其 Runner 标签或 GitHub Environment，也不应为其保留等待中的部署矩阵项。`chat-home-server` 离线时，当前单机部署任务会等待其仓库 Runner 恢复；任务失效后可通过 `workflow_dispatch` 手动运行当前 `main` 的完整构建部署。
