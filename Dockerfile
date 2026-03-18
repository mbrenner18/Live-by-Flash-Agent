# 1. Use Node to build the app
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
# We don't need the lock file because we deleted it!
RUN npm install
COPY . .
RUN npm run build

# 2. Use a tiny web server to serve the static files
FROM node:18-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 8080
# Cloud Run expects traffic on port 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
