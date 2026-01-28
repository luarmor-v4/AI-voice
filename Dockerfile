FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    libopus0 \
    libopus-dev \
    libsodium23 \
    libsodium-dev \
    build-essential \
    curl \
    ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages edge-tts \
    && apt-get purge -y build-essential python3-pip \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p temp data logs && chmod 755 temp data logs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
