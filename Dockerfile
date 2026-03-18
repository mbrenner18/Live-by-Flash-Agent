# 1. Use Node 22 to build the app (Matching project needs)
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
# We don't need the lock file because we deleted it!
RUN npm install
COPY . .

# IMPORTANT FIX: Rebuild native dependencies (like Tailwind/Oxide)
# to make sure they match the architecture of this container
RUN npm rebuild

# Run the build
RUN npm run build

# 2. Use a tiny web server to serve the static files
FROM node:22-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 8080
# Cloud Run expects traffic on port 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
