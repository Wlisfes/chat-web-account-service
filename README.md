<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

本项目已配置 Docker 自动部署。向 `main` 分支提交或合并 Pull Request 后，会自动构建镜像、推送到 GHCR，并通过 `chat-home-server` 上的仓库专用 Self-hosted Runner 部署；失败时自动回滚。原另一台部署机器已废弃，不再创建部署任务。

外部客户由账号域的 `tb_account_consumer` 管理，管理端通过 `/api/account/consumer/**` 访问；Gateway 只使用 Account 服务前缀，Finance 服务不再保存第二份客户主表。

旧财务库客户迁移默认 dry-run；迁移账号需临时拥有旧库只读权限和账号库写入权限，运行时服务账号仍只授权账号库：

```bash
LEGACY_FINANCE_DATABASE=legacy_windows yarn legacy:consumer-migrate
LEGACY_FINANCE_DATABASE=legacy_windows yarn legacy:consumer-migrate --apply
```

`tb_account_consumer.key_id` 从 `5181000` 开始。演示环境可使用固定随机种子生成 120 条客户数据，并轮询分配到最多 20 个启用账号归属人；命令默认只预览，只有 `--apply` 才写入，重复执行会按固定客户 UID 幂等跳过：

```bash
yarn build
yarn seed:consumer
yarn seed:consumer --apply
```

需要生成演示客户时，在 GitHub Actions 手动运行 `Build and deploy` 并勾选 `seedDemoConsumers`。该选项会在 `chat-home-server` 完成 Schema 升级和健康部署后执行；自动 push 部署不会重复造数。

完整的服务器初始化和 GitHub Secrets 配置请参阅 [deploy/README.md](deploy/README.md)。

### Nacos 配置

服务启动时会从 Nacos 加载并监听以下配置：

```text
Namespace ID: replace-with-nacos-namespace-id
Data ID: chat-web-account-service.yaml
Group: DEFAULT_GROUP
```

配置会写入 Nest `ConfigService`，例如 `server.port` 和 `database.chat-web-account.host`。普通配置更新后会动态生效；监听端口、数据库连接池等启动期配置变更后需要重启服务。MySQL、Redis、RabbitMQ、Nacos 等基础服务由独立环境管理，Docker 中的账号服务应使用 Nacos 中配置的可访问地址，不能使用指向账号服务容器自身的 `127.0.0.1`。

账号服务负责校验 Bearer Token。JWT 使用 HS256，密钥必须至少32位，并通过 Nacos 配置提供：

```yaml
security:
    jwt:
        secret: replace-with-at-least-32-random-characters
        issuer: chat-web-account-service
        audience: chat-web
        accessTokenTtlSeconds: 36000
```

当前登录有效期为10小时。管理端会在 Token 使用时间达到有效期的30%后，于下一次接口请求时自动调用 `/auth/token/continue` 轮换会话并重新获得10小时；完全空闲超过10小时后需要重新登录。

除 `/`、健康检查、`/auth/codex/write` 和 `/auth/token/login` 外，接口默认需要登录。内部 `/auth/token/introspect` 会自行校验 Bearer Token 并保留真实 HTTP 状态。组织、菜单、角色和用户授权接口还会校验菜单按钮绑定的权限码。公开业务路由统一使用单数模块、动作式路径、GET query 或 POST body，不使用路径参数。角色数据范围支持 `all`、`self`、`organization`、`organization_tree` 和 `custom`；没有匹配规则时默认无数据权限。

`/health/live` 只检查进程存活；`/health` 和 `/health/ready` 会检查数据库连接、全部必需表和 JWT 密钥是否有效，缺表或密钥缺失时返回 HTTP 503。Docker 使用 `/health`，因此部署前必须先应用共享 Schema 的增量 SQL并配置 JWT 密钥。

账号数据库的 Nacos 配置格式如下；数据库和表必须由外部 SQL 提前创建，TypeORM 固定关闭 `synchronize` 和自动迁移：

```yaml
database:
    chat-web-account:
        host: mysql
        port: 3306
        name: chat-web-account
        username: account_service
        password: replace-with-secret
        charset: utf8mb4
        timezone: +08:00
        logging: false
        poolSize: 10
        connectTimeout: 10000
        retryAttempts: 5
        retryDelay: 3000
```

Redis、JWT 和 MySQL 参数统一维护在 Nacos 远端 `chat-web-account-service.yaml` 中；不同环境通过各自 Namespace 保存实际地址与凭据，不再放入根目录 `.env`。

本地执行 `yarn run dev` 时，根目录 `.env` 只提供 `NODE_ENV`、`PORT` 和 Nacos 连接参数，使用端口 `5010` 运行。显式 `PORT` 的优先级高于 Nacos 的 `server.port`。

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## 可观测性

Docker 部署输出结构化单行 JSON 日志，日志包含 `requestId` 并支持通过容器标准输出直接排障，完整命令见 `deploy/RUNBOOK.md`。
