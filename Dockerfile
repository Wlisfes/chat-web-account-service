# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制依赖清单
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com

# 复制源码并构建
COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS production
WORKDIR /app

# 安装生产依赖（不含 devDependencies）
COPY package.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/main"]
