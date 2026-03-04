FROM node:20-alpine

WORKDIR /app

# Install build tools and system dependencies
RUN apk add --no-cache python3 make g++ py3-pip wget go gcompat

# Copy package files
COPY package*.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/common/package.json ./packages/common/
COPY apps/worker/package.json ./apps/worker/

# Install Node dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build --workspace=@security-analyzer/worker

# Set GOPATH for Go installations
ENV GOPATH=/root/go
ENV PATH=$GOPATH/bin:/usr/local/go/bin:$PATH

# Install Python security scanners
RUN pip3 install --no-cache-dir --break-system-packages \
    bandit \
    checkov \
    semgrep

# Install Trivy (via official install script)
RUN wget -qO- https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.69.3

# Install TruffleHog (via official install script)
RUN wget -qO- https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# Install Go-based scanners
RUN go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest && \
    go install github.com/anchore/grype/cmd/grype@latest

# Expose port
EXPOSE 3000

# Start worker
WORKDIR /app/apps/worker
CMD ["npm", "run", "start"]
