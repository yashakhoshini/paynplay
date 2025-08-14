# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps (include dev for TypeScript)
COPY package*.json ./
RUN npm ci --include=dev

# Copy source and build
COPY . .
# Ensure LF endings inside container (defensive)
RUN git config --global core.autocrlf input || true
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only prod deps in runtime image
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled JS only
COPY --from=builder /app/dist ./dist

# Copy any runtime assets (if you have .env.example or messages, etc.)
# COPY messages.json ./messages.json

EXPOSE 8080
CMD ["node", "dist/index.js"]
