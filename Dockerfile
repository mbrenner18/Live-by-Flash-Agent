# 1. Use Node 22
FROM node:22-slim AS builder
WORKDIR /app

# --- NEW: This part catches the key from Google Cloud ---
ARG VITE_GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
# -------------------------------------------------------

COPY package*.json ./
RUN npm install
COPY . .

# Now Vite WILL see the variable during this step
RUN npm run build

# 2. Serve
FROM node:22-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
