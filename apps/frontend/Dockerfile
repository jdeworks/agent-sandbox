FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/types/package.json ./packages/types/

COPY packages/api-client/package.json ./packages/api-client/
# Install dependencies
COPY apps/frontend/package.json ./apps/frontend/
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build the app
RUN npm run build --workspace=@security-analyzer/frontend

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY --from=builder /app/apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Install curl for healthcheck
RUN apk add --no-cache curl
# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
