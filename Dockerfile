# 1. Builder Stage (The Oven)
FROM node:22-slim AS builder
WORKDIR /app

# Arguments passed from Cloud Build YAML
ARG VITE_GEMINI_API_KEY
ARG GEMINI_API_KEY

# These must be set BEFORE 'npm run build' to be "baked" into the JS
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm install
COPY . .

# Vite bakes the keys into the index-xxx.js files in /dist
RUN npm run build

# 2. Production Stage (The Delivery)
FROM node:22-slim
WORKDIR /app

# Redefine Env vars for the Node.js runtime (Search Bar functionality)
ARG VITE_GEMINI_API_KEY
ARG GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm install --omit=dev

# Copy the static frontend build from the builder
COPY --from=builder /app/dist ./dist

# --- FIX: Point to the correct 'src' folder for server.js ---
COPY src/server.js ./

EXPOSE 8080

# Start the Node server (handles the API keys for the Search Bar)
CMD ["node", "server.js"]
