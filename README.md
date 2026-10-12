# chat-web-task-service

Chat Web 定时任务服务：负责周期任务的 Cron 调度、执行记录、RabbitMQ 投递、失败重试与死信。

- 接口不对外暴露，只提供 `/feign/task/**` 服务间接口；管理端经由 Skyline `/api/skyline/deploy/datetask/*` 访问。
- 数据库：`chat-web-task`（Nacos `database.chat-web-task`），表结构由 `@wlisfes/chat-web-base-schema/chat-web-task-mysql` 提供。
- 消息队列：RabbitMQ 虚拟主机 `/chat-task`（Nacos `rabbitmq` 节点）。

## 本地开发

```bash
yarn install
cp .env.example .env   # 填写 Nacos 连接参数
yarn dev
```

## 验证

```bash
yarn format:check
yarn test
```

详细规约见 [AGENTS.md](AGENTS.md)，部署说明见 [deploy/RUNBOOK.md](deploy/RUNBOOK.md)。
