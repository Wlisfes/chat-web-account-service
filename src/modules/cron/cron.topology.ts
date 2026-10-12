import type { ConfirmChannel } from 'amqplib'
import * as constants from '@/modules/cron/cron.constants'

/**
 * 声明 Task 服务的 RabbitMQ 拓扑，每次（重新）连接后都会执行，声明是幂等的。
 *
 * - 主交换机 chat.task.exchange（direct）→ 主队列 chat.task.execute；
 * - 每个重试梯度一个延迟队列，消息 TTL 到期后经死信转回主交换机，实现延迟重试；
 * - 死信交换机 chat.task.dead.exchange → 死信队列 chat.task.dead，存放最终失败的消息。
 */
export async function setupTaskTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(constants.TASK_EXCHANGE, 'direct', { durable: true })
    await channel.assertExchange(constants.TASK_DEAD_EXCHANGE, 'direct', { durable: true })
    await channel.assertQueue(constants.TASK_EXECUTE_QUEUE, {
        durable: true,
        deadLetterExchange: constants.TASK_DEAD_EXCHANGE,
        deadLetterRoutingKey: constants.TASK_DEAD_ROUTING_KEY
    })
    await channel.bindQueue(constants.TASK_EXECUTE_QUEUE, constants.TASK_EXCHANGE, constants.TASK_EXECUTE_ROUTING_KEY)
    await channel.assertQueue(constants.TASK_DEAD_QUEUE, { durable: true })
    await channel.bindQueue(constants.TASK_DEAD_QUEUE, constants.TASK_DEAD_EXCHANGE, constants.TASK_DEAD_ROUTING_KEY)
    for (const delay of constants.TASK_RETRY_DELAYS_MS) {
        await channel.assertQueue(constants.taskRetryQueue(delay), {
            durable: true,
            messageTtl: delay,
            deadLetterExchange: constants.TASK_EXCHANGE,
            deadLetterRoutingKey: constants.TASK_EXECUTE_ROUTING_KEY
        })
    }
}
