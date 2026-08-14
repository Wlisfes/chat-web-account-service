# Docker 自动部署

向 `master` 分支直接推送或合并 Pull Request 后，GitHub Actions 会：

1. 构建 Docker 镜像，并以完整 Git SHA 和 `latest` 两个标签推送到 GHCR。
2. 通过 SSH 上传 Compose 与部署脚本到服务器。
3. 拉取精确 SHA 镜像、更新容器并等待 `/health` 健康检查。
4. 健康检查失败时恢复到更新前的镜像，并让 Actions 明确失败。

## 服务器初始化

服务器需要安装 Docker Engine、Docker Compose v2，并允许部署用户执行 `docker`。首次部署前执行：

```bash
sudo mkdir -p /opt/chat-web-account-service
sudo chown -R "$USER":"$USER" /opt/chat-web-account-service
cd /opt/chat-web-account-service
# 按 deploy/.env.example 创建 .env，并填写实际配置
```

MySQL、Redis、RabbitMQ、Nacos 等基础服务由独立的基础设施环境管理，不在本业务仓库中启动。部署账号服务前，请确认外部 Docker 网络 `chat-web-infrastructure` 已创建，且账号服务可通过该网络访问 Nacos。业务连接参数统一保存在 Nacos 配置中。

如果修改了 `DEPLOY_PATH` Secret，请在对应目录创建 `.env`。真实 `.env` 只保存在服务器，不上传 GitHub。

## GitHub 配置

在仓库的 `Settings -> Secrets and variables -> Actions` 中添加：

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | 是 | Docker 服务器 IP 或域名 |
| `DEPLOY_USER` | 是 | SSH 部署用户 |
| `DEPLOY_SSH_KEY` | 是 | 对应服务器公钥的私钥全文 |
| `DEPLOY_KNOWN_HOSTS` | 是 | `ssh-keyscan` 得到的服务器主机公钥记录 |
| `DEPLOY_PORT` | 否 | SSH 端口，默认 `22` |
| `DEPLOY_PATH` | 否 | 部署目录，默认 `/opt/chat-web-account-service` |

建议为 Actions 单独生成一个无口令的 SSH 部署密钥，只向该密钥授予部署目录和 Docker 所需权限，不要使用服务器管理员私钥。

生成 `DEPLOY_KNOWN_HOSTS` 时，默认端口使用：

```bash
ssh-keyscan -H your-server.example.com
```

非默认端口使用：

```bash
ssh-keyscan -p 2222 -H your-server.example.com
```

仓库的 Actions `Workflow permissions` 需要允许读写 Packages。若 GHCR 包与仓库没有自动关联，还需在该 Package 的设置中授予本仓库读取权限。

建议在 GitHub 中创建名为 `production` 的 Environment，并按需开启部署审批或分支保护。流水线也可在 Actions 页面通过 `workflow_dispatch` 手动重跑。
