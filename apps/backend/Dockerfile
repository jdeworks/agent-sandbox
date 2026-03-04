FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/common/package.json ./packages/common/
COPY apps/backend/package.json ./apps/backend/

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build TypeScript
RUN npm run build --workspace=@security-analyzer/backend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --spider -q http://localhost:3000/health || exit 1

# Start server
CMD ["node", "apps/backend/dist/index.js"]
