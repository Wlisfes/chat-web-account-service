# Docker 自动部署

向 `master` 分支直接推送或合并 Pull Request 后，GitHub Actions 会：

1. 构建 Docker 镜像，并以完整 Git SHA 和 `latest` 两个标签推送到 GHCR。
2. 将同一个精确 SHA 镜像分别投递给两个内网 Self-hosted Runner。
3. 在线机器立即更新容器并等待 `/health` 健康检查；离线机器保持等待。
4. 健康检查失败时，各机器独立恢复到更新前的镜像。

## 服务器初始化

两台服务器需要安装 Docker Engine、Docker Compose v2，并允许 Runner 用户执行 `docker`。分别在仓库的 `Settings -> Actions -> Runners -> New self-hosted runner` 中按照 GitHub 提供的命令安装 Linux Runner，并添加以下自定义标签：

| 服务器 | Runner 标签 | GitHub Environment |
| --- | --- | --- |
| 当前公司机器 | `chat-server-company` | `production-company` |
| 家中机器 | `chat-server-home` | `production-home` |

安装 Runner 时使用对应标签，例如：

```bash
./config.sh --url https://github.com/Wlisfes/chat-web-account-service \
  --token GITHUB生成的临时TOKEN \
  --labels chat-server-company
sudo ./svc.sh install
sudo ./svc.sh start
```

家中机器将标签改为 `chat-server-home`。首次部署前，每台机器都要执行：

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

## GitHub 配置

不再需要 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS` 和 `DEPLOY_PORT`。Self-hosted Runner 只需主动访问 GitHub 和 `ghcr.io`，两台机器无需互相连接，也不需要开放入站 SSH。

仓库的 Actions `Workflow permissions` 需要允许读写 Packages。若 GHCR 包与仓库没有自动关联，还需在该 Package 的设置中授予本仓库读取权限。

## 离线机器

两台部署任务使用不同的并发组，一台机器离线不会阻止另一台部署，也不会阻止后续镜像构建。新版本会自动取消同一机器正在等待或运行的旧部署，只保留最新版本；如果部署在更新容器时被中断，部署脚本会先恢复原镜像。

机器恢复在线后，Runner 会领取等待中的部署任务。如果机器离线时间过长导致任务失效，可在 Actions 页面通过 `workflow_dispatch` 手动运行当前 `master` 的完整构建部署。
