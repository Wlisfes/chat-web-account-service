/**
 * 本地 Webhook 接收器
 * 接收 GitHub Actions 构建完成的通知，自动拉取镜像并更新 K8s
 *
 * 启动: node auto-deploy.js
 * 默认监听 9100 端口
 *
 * 在 GitHub Actions 中配置 secrets:
 *   DEPLOY_WEBHOOK_URL = http://你的公网IP或域名:9100/deploy
 *   DEPLOY_TOKEN = 与下方 TOKEN 一致
 */

const http = require('http')
const { execSync } = require('child_process')

const PORT = process.env.DEPLOY_PORT || 9100
const TOKEN = process.env.DEPLOY_TOKEN || 'change-me-in-production'
const IMAGE_NAME = 'chat-web-account-service'

const server = http.createServer((req, res) => {
    if (req.url !== '/deploy' || req.method !== 'POST') {
        res.statusCode = 404
        res.end('Not Found')
        return
    }

    const auth = req.headers['authorization'] || ''
    const expected = `Bearer ${TOKEN}`
    if (auth !== expected) {
        res.statusCode = 401
        res.end('Unauthorized')
        console.log(`[${new Date().toISOString()}] Unauthorized request from ${req.socket.remoteAddress}`)
        return
    }

    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
        res.statusCode = 202
        res.end('Accepted')

        try {
            const payload = JSON.parse(body)
            const image = payload.image || `${IMAGE_NAME}:latest`
            console.log(`[${new Date().toISOString()}] Deploy triggered: ${image}`)

            // 拉取镜像并更新 K8s
            console.log(`Pulling image: ${image}`)
            execSync(`docker pull ${image}`, { stdio: 'inherit' })

            console.log('Updating K8s deployment...')
            execSync(`kubectl set image deployment/${IMAGE_NAME} app=${image}`, { stdio: 'inherit' })
            execSync(`kubectl rollout status deployment/${IMAGE_NAME} --timeout=180s`, { stdio: 'inherit' })

            console.log(`[${new Date().toISOString()}] Deploy completed: ${image}`)
        } catch (err) {
            console.error(`[${new Date().toISOString()}] Deploy failed:`, err.message)
        }
    })
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook receiver listening on http://0.0.0.0:${PORT}/deploy`)
    console.log(`Token: ${TOKEN === 'change-me-in-production' ? 'WARNING: using default token!' : '***'}`)
})
