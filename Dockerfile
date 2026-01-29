FROM node:20-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    gcc \
    build-essential \
    pkg-config \
    ffmpeg \
    opus-tools \
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

# Copy package files
COPY package*.json ./

# Install Node dependencies with rebuild
RUN npm install --omit=dev \
    && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p temp data logs \
    && chmod 755 temp data logs

# Environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    FFMPEG_PATH=/usr/bin/ffmpeg

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
