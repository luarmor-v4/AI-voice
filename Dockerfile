FROM node:20-slim

# Install dependencies untuk audio processing
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    libopus0 \
    libopus-dev \
    libsodium23 \
    libsodium-dev \
    libtool \
    autoconf \
    automake \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install edge-tts via pip
RUN pip3 install --break-system-packages edge-tts

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Rebuild sodium-native untuk platform yang benar
RUN npm rebuild sodium-native

# Copy source code
COPY . .

# Create temp directory
RUN mkdir -p temp && chmod 777 temp

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start bot
CMD ["npm", "start"]
