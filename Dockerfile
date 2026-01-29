FROM node:20-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    build-essential \
    pkg-config \
    ffmpeg \
    libopus0 \
    libopus-dev \
    libsodium23 \
    libsodium-dev \
    libtool \
    autoconf \
    automake \
    curl \
    ca-certificates \
    && pip3 install --no-cache-dir edge-tts \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies with native rebuild
RUN npm install --omit=dev \
    && npm rebuild sodium-native --build-from-source \
    && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p temp data logs && chmod 755 temp data logs

# Environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000
CMD ["node", "src/index.js"]
