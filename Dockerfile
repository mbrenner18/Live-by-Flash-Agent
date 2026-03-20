# 1. Builder
FROM node:22-slim AS builder
WORKDIR /app

# Arguments passed from Cloud Build
ARG VITE_GEMINI_API_KEY
ARG GEMINI_API_KEY

# Set as Env vars for the Vite build process
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm install
COPY . .

# Run build - this "bakes" the key into the JS files in dist/
RUN npm run build

# 2. Production
FROM node:22-slim
WORKDIR /app

# Redefine Env vars for the production runtime (Server side)
ARG VITE_GEMINI_API_KEY
ARG GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm install --omit=dev

# Copy build output and server
COPY --from=builder /app/dist ./dist
COPY server.js ./

EXPOSE 8080
# Use node server.js instead of 'serve' to handle process.env better
CMD ["node", "server.js"]
