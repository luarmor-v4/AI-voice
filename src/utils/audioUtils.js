const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const execAsync = promisify(exec);

// Pastikan folder temp ada
function ensureTempDir() {
    if (!fs.existsSync(config.tempDir)) {
        fs.mkdirSync(config.tempDir, { recursive: true });
    }
}

// Convert PCM to WAV untuk STT
async function pcmToWav(pcmPath) {
    const wavPath = pcmPath.replace('.pcm', '.wav');
    
    // Discord audio: 48kHz, stereo, 16-bit signed little-endian
    const command = `ffmpeg -f s16le -ar 48000 -ac 2 -i "${pcmPath}" "${wavPath}" -y`;
    
    await execAsync(command);
    return wavPath;
}

// Cleanup temporary files
function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}

// Generate unique filename
function generateTempPath(prefix, extension) {
    ensureTempDir();
    return path.join(config.tempDir, `${prefix}_${Date.now()}.${extension}`);
}

module.exports = {
    ensureTempDir,
    pcmToWav,
    cleanupFile,
    generateTempPath
};
