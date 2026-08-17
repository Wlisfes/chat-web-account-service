# Docker 自动部署

部署基线、故障恢复和跨机器操作记录：

- [部署变更记录](./CHANGELOG.md)
- [故障恢复手册](./RUNBOOK.md)

凡是修改 Docker、Actions、Nacos、端口、环境变量、健康检查或 Runner，必须在同一次提交中更新部署变更记录。

向 `master` 分支直接推送或合并 Pull Request 后，GitHub Actions 会：

1. 构建 Docker 镜像，并以完整 Git SHA 和 `latest` 两个标签推送到 GHCR。
2. 将同一个精确 SHA 镜像分别投递给两个内网 Self-hosted Runner。
3. 在线机器立即更新容器并等待 `/health` 健康检查；离线机器保持等待。
4. 健康检查失败时，各机器独立恢复到更新前的镜像。

## 服务器初始化

两台服务器需要安装 Docker Engine、Docker Compose v2，并允许 Runner 用户执行 `docker`。分别在仓库的 `Settings -> Actions -> Runners -> New self-hosted runner` 中按照 GitHub 提供的命令安装 Linux Runner，并添加以下自定义标签：

| 服务器       | Runner 标签           | GitHub Environment   |
| ------------ | --------------------- | -------------------- |
| 当前公司机器 | `chat-server-company` | `production-company` |
| 家中机器     | `chat-server-home`    | `production-home`    |

安装 Runner 时使用对应标签，例如：

```bash
./config.sh --url https://github.com/Wlisfes/chat-web-account-service \
  --token GITHUB生成的临时TOKEN \
  --labels chat-server-company
sudo ./svc.sh install
sudo ./svc.sh start
```

家中机器将标签改为 `chat-server-home`。首次部署前，每台机器都要执行：

Self-hosted Runner 默认只属于注册它的仓库。当前 Runner 不能替 `chat-web-gateway-service` 执行部署；同一台机器部署网关时，需要在网关仓库的 `Settings -> Actions -> Runners` 中获取新的临时 Token，并使用独立目录再安装一个 Runner 服务。不要让两个仓库共用同一个 Runner 安装目录。

```bash
sudo usermod -aG docker "RUNNER用户"
sudo mkdir -p /opt/chat-web-account-service
sudo chown -R "RUNNER用户":"RUNNER用户" /opt/chat-web-account-service
cd /opt/chat-web-account-service
# 按 deploy/.env.example 创建 .env，并填写实际配置
```

修改 Docker 用户组后，需要重新登录该用户或重启 Runner 服务，并确认 Runner 用户执行 `docker info`、`docker compose version` 均成功。

MySQL、Redis、RabbitMQ、Nacos 等基础服务由独立的基础设施环境管理，不在本业务仓库中启动。部署账号服务前，请确认外部 Docker 网络 `chat-web-infrastructure` 已创建，且账号服务可通过该网络访问 Nacos。业务连接参数统一保存在 Nacos 配置中。

真实 `.env` 分别保存在两台服务器，不上传 GitHub。若需要修改部署目录，请在对应 GitHub Environment 中添加 `DEPLOY_PATH` Variable，并在该目录创建 `.env`。

在 `production-company` 和 `production-home` 两个 GitHub Environment 中分别创建 `JWT_SECRET` Secret，长度至少32位。部署任务会在不输出密钥的前提下同步服务器 `.env`，并在切换容器前使用新镜像中的 Schema 升级器应用尚未执行的增量 SQL。升级器以文件名和 SHA-256 校验和记录执行状态；已经应用的文件不会重复执行，被修改的历史文件会导致部署立即失败。

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

不再需要 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS` 和 `DEPLOY_PORT`。Self-hosted Runner 只需主动访问 GitHub 和 `ghcr.io`，两台机器无需互相连接，也不需要开放入站 SSH。

仓库的 Actions `Workflow permissions` 需要允许读写 Packages。若 GHCR 包与仓库没有自动关联，还需在该 Package 的设置中授予本仓库读取权限。

## 离线机器

两台部署任务使用不同的并发组，一台机器离线不会阻止另一台部署，也不会阻止后续镜像构建。新版本会自动取消同一机器正在等待或运行的旧部署，只保留最新版本；如果部署在更新容器时被中断，部署脚本会先恢复原镜像。

机器恢复在线后，Runner 会领取等待中的部署任务。如果机器离线时间过长导致任务失效，可在 Actions 页面通过 `workflow_dispatch` 手动运行当前 `master` 的完整构建部署。
