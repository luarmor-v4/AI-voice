// ============================================================
//         DISCORD AI BOT - MULTI PROVIDER
//         Version 2.0 - Januari 2026
// ============================================================

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType 
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const { execSync, exec } = require('child_process');
const { createServer } = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== KONFIGURASI ====================
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    dataPath: './data/settings.json'
};

// ==================== AI PROVIDERS & MODELS ====================
const AI_PROVIDERS = {
    groq: {
        name: 'Groq',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
            { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
            { id: 'meta-llama/llama-4-maverick-17b-128e', name: 'Llama 4 Maverick 17B' },
            { id: 'gemma2-9b-it', name: 'Gemma2 9B' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
        ]
    },
    pollinations: {
        name: 'Pollinations',
        requiresKey: false,
        models: [
            { id: 'openai', name: 'OpenAI GPT-4.1' },
            { id: 'claude', name: 'Claude' },
            { id: 'gemini', name: 'Gemini 2.5 Pro' },
            { id: 'deepseek', name: 'DeepSeek V3.2' },
            { id: 'mistral', name: 'Mistral' },
            { id: 'llama', name: 'Llama' },
            { id: 'qwen3-coder', name: 'Qwen3 Coder' },
            { id: 'glm-4.7', name: 'GLM 4.7' }
        ]
    },
    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B' },
            { id: 'qwen/qwen3-14b:free', name: 'Qwen3 14B' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B' },
            { id: 'deepseek/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera' },
            { id: 'deepseek/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera' },
            { id: 'google/gemma-3-4b:free', name: 'Gemma 3 4B' },
            { id: 'google/gemma-3-12b:free', name: 'Gemma 3 12B' },
            { id: 'google/gemma-3-27b:free', name: 'Gemma 3 27B' },
            { id: 'google/gemma-3n-2b:free', name: 'Gemma 3n 2B' },
            { id: 'mistralai/mistral-small-3.1-24b:free', name: 'Mistral Small 3.1 24B' },
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B' },
            { id: 'thudm/glm-4.5-air:free', name: 'GLM 4.5 Air' },
            { id: 'featherless/trinity-mini:free', name: 'Trinity Mini' },
            { id: 'featherless/trinity-large-preview:free', name: 'Trinity Large' },
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3' },
            { id: 'liquid/lfm2.5-1.2b-thinking:free', name: 'LFM 1.2B Thinking' },
            { id: 'liquid/lfm2.5-1.2b-instruct:free', name: 'LFM 1.2B Instruct' },
            { id: 'allenai/molmo2-8b:free', name: 'Molmo2 8B' },
            { id: 'moonshotai/kimi-vl-a3b-thinking:free', name: 'Kimi VL A3B' },
            { id: 'bytedance/seedream-4.5:free', name: 'Seedream 4.5' }
        ]
    },
    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini' }
        ]
    }
};

// ==================== TTS PROVIDERS & VOICES ====================
const TTS_PROVIDERS = {
    edge: {
        name: 'Edge TTS',
        requiresKey: false,
        voices: [
            { id: 'id-ID-GadisNeural', name: 'Gadis (ID Female)', lang: 'id' },
            { id: 'id-ID-ArdiNeural', name: 'Ardi (ID Male)', lang: 'id' },
            { id: 'en-US-JennyNeural', name: 'Jenny (EN Female)', lang: 'en' },
            { id: 'en-US-GuyNeural', name: 'Guy (EN Male)', lang: 'en' },
            { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', lang: 'en' },
            { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP Female)', lang: 'ja' },
            { id: 'ko-KR-SunHiNeural', name: 'SunHi (KR Female)', lang: 'ko' },
            { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN Female)', lang: 'zh' }
        ]
    },
    pollinations: {
        name: 'Pollinations TTS',
        requiresKey: false,
        voices: [
            { id: 'alloy', name: 'Alloy', lang: 'multi' },
            { id: 'echo', name: 'Echo', lang: 'multi' },
            { id: 'fable', name: 'Fable', lang: 'multi' },
            { id: 'onyx', name: 'Onyx', lang: 'multi' },
            { id: 'nova', name: 'Nova', lang: 'multi' },
            { id: 'shimmer', name: 'Shimmer', lang: 'multi' }
        ]
    },
    elevenlabs: {
        name: 'ElevenLabs',
        requiresKey: true,
        keyEnv: 'ELEVENLABS_API_KEY',
        voices: [
            { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', lang: 'multi' },
            { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', lang: 'multi' },
            { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', lang: 'multi' },
            { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', lang: 'multi' },
            { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', lang: 'multi' },
            { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', lang: 'multi' }
        ]
    }
};

// ==================== DEFAULT SETTINGS ====================
const DEFAULT_SETTINGS = {
    aiProvider: 'groq',
    aiModel: 'llama-3.3-70b-versatile',
    ttsProvider: 'edge',
    ttsVoice: 'id-ID-GadisNeural',
    mode: 'voice', // 'text' atau 'voice'
    systemPrompt: `Kamu adalah Aria, asisten AI yang ramah dan helpful berbahasa Indonesia.
Karakteristik: Ramah, ceria, jawaban singkat (2-3 kalimat untuk voice), natural.`
};

// ==================== DISCORD CLIENT ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Storage
const guildSettings = new Map();
const conversations = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();

// ==================== SETTINGS MANAGEMENT ====================
function loadSettings() {
    try {
        if (fs.existsSync(CONFIG.dataPath)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
            Object.entries(data).forEach(([guildId, settings]) => {
                guildSettings.set(guildId, { ...DEFAULT_SETTINGS, ...settings });
            });
            console.log(`📂 Loaded settings for ${guildSettings.size} guilds`);
        }
    } catch (e) {
        console.error('Failed to load settings:', e.message);
    }
}

function saveSettings() {
    try {
        const dir = path.dirname(CONFIG.dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const data = {};
        guildSettings.forEach((settings, guildId) => {
            data[guildId] = settings;
        });
        fs.writeFileSync(CONFIG.dataPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save settings:', e.message);
    }
}

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) {
        guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const settings = getSettings(guildId);
    settings[key] = value;
    guildSettings.set(guildId, settings);
    saveSettings();
}

function isAdmin(userId) {
    return CONFIG.adminIds.includes(userId);
}

// ==================== AI PROVIDERS IMPLEMENTATION ====================
async function callAI(guildId, userMessage, history = []) {
    const settings = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt } = settings;
    
    try {
        switch (aiProvider) {
            case 'groq':
                return await callGroq(aiModel, userMessage, history, systemPrompt);
            case 'pollinations':
                return await callPollinations(aiModel, userMessage, history, systemPrompt);
            case 'openrouter':
                return await callOpenRouter(aiModel, userMessage, history, systemPrompt);
            case 'huggingface':
                return await callHuggingFace(aiModel, userMessage, history, systemPrompt);
            default:
                // Fallback ke Pollinations
                return await callPollinations('openai', userMessage, history, systemPrompt);
        }
    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);
        
        // Auto-fallback ke Pollinations
        if (aiProvider !== 'pollinations') {
            console.log('Falling back to Pollinations...');
            try {
                return await callPollinations('openai', userMessage, history, systemPrompt);
            } catch (e) {
                throw new Error('Semua AI provider gagal');
            }
        }
        throw error;
    }
}

// Groq API
async function callGroq(model, message, history, systemPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY tidak ditemukan');
    
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
        { role: 'user', content: message }
    ];
    
    const response = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
    }));
    
    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
}

// Pollinations API (Tanpa API Key!)
async function callPollinations(model, message, history, systemPrompt) {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
        { role: 'user', content: message }
    ];
    
    const response = await httpRequest({
        hostname: 'text.pollinations.ai',
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
        messages: messages,
        model: model,
        seed: Math.floor(Math.random() * 1000000)
    }));
    
    // Pollinations returns plain text
    return response.trim();
}

// OpenRouter API
async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY tidak ditemukan');
    
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
        { role: 'user', content: message }
    ];
    
    const response = await httpRequest({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://discord.com',
            'X-Title': 'Discord AI Bot'
        }
    }, JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 500
    }));
    
    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
}

// HuggingFace API
async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY tidak ditemukan');
    
    const prompt = `${systemPrompt}\n\nUser: ${message}\nAssistant:`;
    
    const response = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    }, JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 300, temperature: 0.7 }
    }));
    
    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data) ? data[0].generated_text.split('Assistant:').pop().trim() : data.generated_text;
}

// ==================== TTS IMPLEMENTATION ====================
async function generateTTS(guildId, text) {
    const settings = getSettings(guildId);
    const { ttsProvider, ttsVoice } = settings;
    
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `tts_${Date.now()}.mp3`);
    
    try {
        switch (ttsProvider) {
            case 'edge':
                return await generateEdgeTTS(text, ttsVoice, outputPath);
            case 'pollinations':
                return await generatePollinationsTTS(text, ttsVoice, outputPath);
            case 'elevenlabs':
                return await generateElevenLabsTTS(text, ttsVoice, outputPath);
            default:
                return await generateEdgeTTS(text, 'id-ID-GadisNeural', outputPath);
        }
    } catch (error) {
        console.error(`TTS Error (${ttsProvider}):`, error.message);
        
        // Fallback ke Edge TTS
        if (ttsProvider !== 'edge') {
            console.log('Falling back to Edge TTS...');
            return await generateEdgeTTS(text, 'id-ID-GadisNeural', outputPath);
        }
        throw error;
    }
}

// Edge TTS
async function generateEdgeTTS(text, voice, outputPath) {
    const sanitized = text.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').slice(0, 500);
    const cmd = `edge-tts --voice "${voice}" --text "${sanitized}" --write-media "${outputPath}"`;
    
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 30000 }, (error) => {
            if (error) reject(error);
            else if (fs.existsSync(outputPath)) resolve(outputPath);
            else reject(new Error('TTS file not created'));
        });
    });
}

// Pollinations TTS
async function generatePollinationsTTS(text, voice, outputPath) {
    const encoded = encodeURIComponent(text.slice(0, 500));
    const url = `https://text.pollinations.ai/${encoded}?model=openai-audio&voice=${voice}`;
    
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(outputPath);
            });
        }).on('error', reject);
    });
}

// ElevenLabs TTS
async function generateElevenLabsTTS(text, voiceId, outputPath) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY tidak ditemukan');
    
    const response = await httpRequestBinary({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
        }
    }, JSON.stringify({
        text: text.slice(0, 500),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }));
    
    fs.writeFileSync(outputPath, response);
    return outputPath;
}

// ==================== HTTP HELPERS ====================
function httpRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(60000, () => reject(new Error('Request timeout')));
        if (body) req.write(body);
        req.end();
    });
}

function httpRequestBinary(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// ==================== EMBED BUILDERS ====================
function createSettingsEmbed(guildId) {
    const settings = getSettings(guildId);
    const aiProvider = AI_PROVIDERS[settings.aiProvider];
    const ttsProvider = TTS_PROVIDERS[settings.ttsProvider];
    
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Bot Settings')
        .setDescription('Konfigurasi AI Bot saat ini')
        .addFields(
            { 
                name: '🧠 AI Provider', 
                value: `**${aiProvider?.name || settings.aiProvider}**\nModel: \`${settings.aiModel}\``, 
                inline: true 
            },
            { 
                name: '🔊 TTS Provider', 
                value: `**${ttsProvider?.name || settings.ttsProvider}**\nVoice: \`${settings.ttsVoice}\``, 
                inline: true 
            },
            { 
                name: '📝 Mode', 
                value: settings.mode === 'voice' ? '🔊 Text + Voice' : '📝 Text Only', 
                inline: true 
            }
        )
        .setFooter({ text: 'Gunakan menu di bawah untuk mengubah settings' })
        .setTimestamp();
}

function createProvidersEmbed() {
    let aiList = '';
    Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
        const status = provider.requiresKey ? (process.env[provider.keyEnv] ? '🟢' : '🔴') : '🟢';
        aiList += `${status} **${provider.name}** (${provider.models.length} models)\n`;
    });
    
    let ttsList = '';
    Object.entries(TTS_PROVIDERS).forEach(([key, provider]) => {
        const status = provider.requiresKey ? (process.env[provider.keyEnv] ? '🟢' : '🔴') : '🟢';
        ttsList += `${status} **${provider.name}** (${provider.voices.length} voices)\n`;
    });
    
    return new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📋 Available Providers')
        .addFields(
            { name: '🧠 AI Providers', value: aiList, inline: true },
            { name: '🔊 TTS Providers', value: ttsList, inline: true }
        )
        .setFooter({ text: '🟢 = Tersedia, 🔴 = API Key tidak ditemukan' });
}

// ==================== MENU BUILDERS ====================
function createAIProviderMenu(guildId) {
    const settings = getSettings(guildId);
    
    const options = Object.entries(AI_PROVIDERS).map(([key, provider]) => {
        const available = !provider.requiresKey || process.env[provider.keyEnv];
        return {
            label: provider.name,
            description: `${provider.models.length} models${!available ? ' (No API Key)' : ''}`,
            value: key,
            default: key === settings.aiProvider,
            emoji: available ? '🟢' : '🔴'
        };
    });
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_ai_provider')
            .setPlaceholder('Pilih AI Provider')
            .addOptions(options)
    );
}

function createAIModelMenu(guildId) {
    const settings = getSettings(guildId);
    const provider = AI_PROVIDERS[settings.aiProvider];
    
    if (!provider) return null;
    
    const options = provider.models.slice(0, 25).map(model => ({
        label: model.name,
        description: model.id.slice(0, 50),
        value: model.id,
        default: model.id === settings.aiModel
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_ai_model')
            .setPlaceholder(`Pilih Model (${provider.name})`)
            .addOptions(options)
    );
}

function createTTSProviderMenu(guildId) {
    const settings = getSettings(guildId);
    
    const options = Object.entries(TTS_PROVIDERS).map(([key, provider]) => {
        const available = !provider.requiresKey || process.env[provider.keyEnv];
        return {
            label: provider.name,
            description: `${provider.voices.length} voices${!available ? ' (No API Key)' : ''}`,
            value: key,
            default: key === settings.ttsProvider,
            emoji: available ? '🟢' : '🔴'
        };
    });
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_tts_provider')
            .setPlaceholder('Pilih TTS Provider')
            .addOptions(options)
    );
}

function createTTSVoiceMenu(guildId) {
    const settings = getSettings(guildId);
    const provider = TTS_PROVIDERS[settings.ttsProvider];
    
    if (!provider) return null;
    
    const options = provider.voices.map(voice => ({
        label: voice.name,
        description: `${voice.id} (${voice.lang})`,
        value: voice.id,
        default: voice.id === settings.ttsVoice
    }));
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_tts_voice')
            .setPlaceholder(`Pilih Voice (${provider.name})`)
            .addOptions(options)
    );
}

function createModeButtons(guildId) {
    const settings = getSettings(guildId);
    
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mode_text')
            .setLabel('📝 Text Only')
            .setStyle(settings.mode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('mode_voice')
            .setLabel('🔊 Text + Voice')
            .setStyle(settings.mode === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('refresh_settings')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
    );
}

// ==================== COMMANDS ====================
async function handleCommand(message, command, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    
    switch (command) {
        case 'ask':
        case 'a':
            await handleAsk(message, args.join(' '));
            break;
            
        case 'settings':
        case 'config':
            if (!isAdmin(userId)) {
                return message.reply('❌ Hanya admin yang bisa mengubah settings!');
            }
            await showSettings(message);
            break;
            
        case 'providers':
        case 'models':
            await message.reply({ embeds: [createProvidersEmbed()] });
            break;
            
        case 'setai':
            if (!isAdmin(userId)) return message.reply('❌ Admin only!');
            await setAIProvider(message, args[0]);
            break;
            
        case 'setmodel':
            if (!isAdmin(userId)) return message.reply('❌ Admin only!');
            await setAIModel(message, args.join(' '));
            break;
            
        case 'settts':
            if (!isAdmin(userId)) return message.reply('❌ Admin only!');
            await setTTSProvider(message, args[0]);
            break;
            
        case 'setvoice':
            if (!isAdmin(userId)) return message.reply('❌ Admin only!');
            await setTTSVoice(message, args[0]);
            break;
            
        case 'setmode':
            if (!isAdmin(userId)) return message.reply('❌ Admin only!');
            await setMode(message, args[0]);
            break;
            
        case 'join':
            await joinVoice(message);
            break;
            
        case 'leave':
        case 'dc':
            await leaveVoice(message);
            break;
            
        case 'status':
            await showStatus(message);
            break;
            
        case 'help':
        case 'h':
            await showHelp(message);
            break;
    }
}

async function handleAsk(message, question) {
    if (!question) {
        return message.reply('❓ Mau tanya apa? Contoh: `!ask Apa itu AI?`');
    }
    
    const guildId = message.guild.id;
    const userId = message.author.id;
    const settings = getSettings(guildId);
    
    await message.channel.sendTyping();
    
    try {
        // Get conversation history
        const historyKey = `${guildId}-${userId}`;
        const history = conversations.get(historyKey) || [];
        
        // Call AI
        const response = await callAI(guildId, question, history);
        
        // Update history
        history.push({ role: 'user', content: question });
        history.push({ role: 'assistant', content: response });
        conversations.set(historyKey, history.slice(-20));
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00D166)
            .setAuthor({ name: message.author.displayName, iconURL: message.author.displayAvatarURL() })
            .addFields(
                { name: '❓ Pertanyaan', value: question.slice(0, 1024) },
                { name: '🤖 Jawaban', value: response.slice(0, 1024) }
            )
            .setFooter({ text: `${AI_PROVIDERS[settings.aiProvider]?.name || settings.aiProvider} | ${settings.aiModel}` })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        
        // Generate voice if mode is voice and user in voice channel
        if (settings.mode === 'voice') {
            const voiceChannel = message.member?.voice.channel;
            const connection = voiceConnections.get(guildId);
            
            if (voiceChannel && connection) {
                try {
                    const audioPath = await generateTTS(guildId, response);
                    await playAudio(guildId, audioPath);
                } catch (e) {
                    console.error('TTS Error:', e.message);
                }
            }
        }
        
    } catch (error) {
        console.error('Ask error:', error);
        await message.reply(`❌ Error: ${error.message}`);
    }
}

async function showSettings(message) {
    const guildId = message.guild.id;
    
    const components = [
        createAIProviderMenu(guildId),
        createAIModelMenu(guildId),
        createTTSProviderMenu(guildId),
        createTTSVoiceMenu(guildId),
        createModeButtons(guildId)
    ].filter(Boolean);
    
    await message.reply({
        embeds: [createSettingsEmbed(guildId)],
        components: components
    });
}

async function setAIProvider(message, provider) {
    if (!provider || !AI_PROVIDERS[provider]) {
        const list = Object.keys(AI_PROVIDERS).join(', ');
        return message.reply(`❌ Provider tidak valid! Pilih: ${list}`);
    }
    
    const providerInfo = AI_PROVIDERS[provider];
    if (providerInfo.requiresKey && !process.env[providerInfo.keyEnv]) {
        return message.reply(`❌ ${providerInfo.name} membutuhkan API Key (${providerInfo.keyEnv})`);
    }
    
    updateSettings(message.guild.id, 'aiProvider', provider);
    updateSettings(message.guild.id, 'aiModel', providerInfo.models[0].id);
    
    await message.reply(`✅ AI Provider diubah ke **${providerInfo.name}**\nModel: \`${providerInfo.models[0].id}\``);
}

async function setAIModel(message, modelId) {
    const guildId = message.guild.id;
    const settings = getSettings(guildId);
    const provider = AI_PROVIDERS[settings.aiProvider];
    
    if (!modelId) {
        const models = provider.models.map(m => `\`${m.id}\``).join('\n');
        return message.reply(`📋 Model tersedia untuk ${provider.name}:\n${models}`);
    }
    
    const model = provider.models.find(m => m.id === modelId || m.id.includes(modelId));
    if (!model) {
        return message.reply(`❌ Model tidak ditemukan! Gunakan \`!setmodel\` untuk melihat daftar.`);
    }
    
    updateSettings(guildId, 'aiModel', model.id);
    await message.reply(`✅ Model diubah ke **${model.name}** (\`${model.id}\`)`);
}

async function setTTSProvider(message, provider) {
    if (!provider || !TTS_PROVIDERS[provider]) {
        const list = Object.keys(TTS_PROVIDERS).join(', ');
        return message.reply(`❌ Provider tidak valid! Pilih: ${list}`);
    }
    
    const providerInfo = TTS_PROVIDERS[provider];
    if (providerInfo.requiresKey && !process.env[providerInfo.keyEnv]) {
        return message.reply(`❌ ${providerInfo.name} membutuhkan API Key (${providerInfo.keyEnv})`);
    }
    
    updateSettings(message.guild.id, 'ttsProvider', provider);
    updateSettings(message.guild.id, 'ttsVoice', providerInfo.voices[0].id);
    
    await message.reply(`✅ TTS Provider diubah ke **${providerInfo.name}**\nVoice: \`${providerInfo.voices[0].id}\``);
}

async function setTTSVoice(message, voiceId) {
    const guildId = message.guild.id;
    const settings = getSettings(guildId);
    const provider = TTS_PROVIDERS[settings.ttsProvider];
    
    if (!voiceId) {
        const voices = provider.voices.map(v => `\`${v.id}\` - ${v.name}`).join('\n');
        return message.reply(`📋 Voices tersedia untuk ${provider.name}:\n${voices}`);
    }
    
    const voice = provider.voices.find(v => v.id === voiceId || v.id.includes(voiceId));
    if (!voice) {
        return message.reply(`❌ Voice tidak ditemukan! Gunakan \`!setvoice\` untuk melihat daftar.`);
    }
    
    updateSettings(guildId, 'ttsVoice', voice.id);
    await message.reply(`✅ Voice diubah ke **${voice.name}** (\`${voice.id}\`)`);
}

async function setMode(message, mode) {
    if (!['text', 'voice'].includes(mode)) {
        return message.reply('❌ Mode tidak valid! Pilih: `text` atau `voice`');
    }
    
    updateSettings(message.guild.id, 'mode', mode);
    await message.reply(`✅ Mode diubah ke **${mode === 'voice' ? '🔊 Text + Voice' : '📝 Text Only'}**`);
}

async function joinVoice(message) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        return message.reply('❌ Kamu harus masuk voice channel dulu!');
    }
    
    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: false
        });
        
        await entersState(connection, VoiceConnectionStatus.Ready, 30000);
        
        const player = createAudioPlayer();
        connection.subscribe(player);
        
        voiceConnections.set(message.guild.id, connection);
        audioPlayers.set(message.guild.id, player);
        
        await message.reply(`✅ Joined **${voiceChannel.name}**! Sekarang aku bisa berbicara 🎤`);
    } catch (error) {
        console.error('Join error:', error);
        await message.reply('❌ Gagal join voice channel!');
    }
}

async function leaveVoice(message) {
    const connection = voiceConnections.get(message.guild.id);
    if (!connection) {
        return message.reply('❌ Aku tidak sedang di voice channel!');
    }
    
    connection.destroy();
    voiceConnections.delete(message.guild.id);
    audioPlayers.delete(message.guild.id);
    
    await message.reply('👋 Bye bye!');
}

async function playAudio(guildId, audioPath) {
    const player = audioPlayers.get(guildId);
    if (!player) return;
    
    try {
        const resource = createAudioResource(audioPath);
        player.play(resource);
        
        player.once(AudioPlayerStatus.Idle, () => {
            try { fs.unlinkSync(audioPath); } catch (e) {}
        });
    } catch (error) {
        console.error('Play audio error:', error);
    }
}

async function showStatus(message) {
    const guildId = message.guild.id;
    const settings = getSettings(guildId);
    
    let status = '**🔍 Provider Status:**\n\n';
    
    // AI Providers
    for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
        const available = !provider.requiresKey || process.env[provider.keyEnv];
        const active = key === settings.aiProvider ? ' ← Active' : '';
        status += `${available ? '🟢' : '🔴'} **${provider.name}**${active}\n`;
    }
    
    status += '\n';
    
    // TTS Providers
    for (const [key, provider] of Object.entries(TTS_PROVIDERS)) {
        const available = !provider.requiresKey || process.env[provider.keyEnv];
        const active = key === settings.ttsProvider ? ' ← Active' : '';
        status += `${available ? '🟢' : '🔴'} **${provider.name}**${active}\n`;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 System Status')
        .setDescription(status)
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 AI Bot - Help')
        .setDescription('Bot AI dengan multi-provider support')
        .addFields(
            {
                name: '💬 Chat',
                value: '`!ask <pertanyaan>` - Tanya AI\n`!join` - Join voice channel\n`!leave` - Leave voice channel',
                inline: false
            },
            {
                name: '⚙️ Settings (Admin)',
                value: '`!settings` - Menu settings\n`!setai <provider>` - Ganti AI\n`!setmodel <model>` - Ganti model\n`!settts <provider>` - Ganti TTS\n`!setvoice <voice>` - Ganti voice\n`!setmode <text/voice>` - Ganti mode',
                inline: false
            },
            {
                name: '📋 Info',
                value: '`!providers` - List providers\n`!status` - Cek status\n`!help` - Bantuan',
                inline: false
            }
        )
        .setFooter({ text: 'Multi-Provider AI Bot' });
    
    await message.reply({ embeds: [embed] });
}

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });
    }
    
    const guildId = interaction.guild.id;
    
    try {
        if (interaction.customId === 'select_ai_provider') {
            const provider = interaction.values[0];
            const providerInfo = AI_PROVIDERS[provider];
            
            if (providerInfo.requiresKey && !process.env[providerInfo.keyEnv]) {
                return interaction.reply({ content: `❌ ${providerInfo.name} membutuhkan API Key!`, ephemeral: true });
            }
            
            updateSettings(guildId, 'aiProvider', provider);
            updateSettings(guildId, 'aiModel', providerInfo.models[0].id);
        }
        else if (interaction.customId === 'select_ai_model') {
            updateSettings(guildId, 'aiModel', interaction.values[0]);
        }
        else if (interaction.customId === 'select_tts_provider') {
            const provider = interaction.values[0];
            const providerInfo = TTS_PROVIDERS[provider];
            
            if (providerInfo.requiresKey && !process.env[providerInfo.keyEnv]) {
                return interaction.reply({ content: `❌ ${providerInfo.name} membutuhkan API Key!`, ephemeral: true });
            }
            
            updateSettings(guildId, 'ttsProvider', provider);
            updateSettings(guildId, 'ttsVoice', providerInfo.voices[0].id);
        }
        else if (interaction.customId === 'select_tts_voice') {
            updateSettings(guildId, 'ttsVoice', interaction.values[0]);
        }
        else if (interaction.customId === 'mode_text') {
            updateSettings(guildId, 'mode', 'text');
        }
        else if (interaction.customId === 'mode_voice') {
            updateSettings(guildId, 'mode', 'voice');
        }
        
        // Refresh settings display
        const components = [
            createAIProviderMenu(guildId),
            createAIModelMenu(guildId),
            createTTSProviderMenu(guildId),
            createTTSVoiceMenu(guildId),
            createModeButtons(guildId)
        ].filter(Boolean);
        
        await interaction.update({
            embeds: [createSettingsEmbed(guildId)],
            components: components
        });
        
    } catch (error) {
        console.error('Interaction error:', error);
        await interaction.reply({ content: '❌ Error!', ephemeral: true }).catch(() => {});
    }
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(CONFIG.prefix)) return;
    
    const args = message.content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    try {
        await handleCommand(message, command, args);
    } catch (error) {
        console.error('Command error:', error);
        await message.reply('❌ Terjadi error!');
    }
});

// ==================== BOT READY ====================
client.once('ready', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║        🤖 DISCORD AI BOT v2.0 🤖         ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Bot: ${client.user.tag.padEnd(33)}║`);
    console.log(`║  Servers: ${String(client.guilds.cache.size).padEnd(30)}║`);
    console.log(`║  Prefix: ${CONFIG.prefix.padEnd(31)}║`);
    console.log(`║  Admins: ${String(CONFIG.adminIds.length).padEnd(31)}║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    
    // Show available providers
    console.log('📋 AI Providers:');
    Object.entries(AI_PROVIDERS).forEach(([key, p]) => {
        const status = p.requiresKey ? (process.env[p.keyEnv] ? '🟢' : '🔴') : '🟢';
        console.log(`   ${status} ${p.name} (${p.models.length} models)`);
    });
    
    console.log('');
    console.log('🔊 TTS Providers:');
    Object.entries(TTS_PROVIDERS).forEach(([key, p]) => {
        const status = p.requiresKey ? (process.env[p.keyEnv] ? '🟢' : '🔴') : '🟢';
        console.log(`   ${status} ${p.name} (${p.voices.length} voices)`);
    });
    console.log('');
    
    client.user.setActivity(`${CONFIG.prefix}help | AI Bot`, { type: ActivityType.Listening });
    loadSettings();
});

// ==================== HEALTH CHECK SERVER ====================
const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: client.user?.tag,
        guilds: client.guilds?.cache.size,
        uptime: process.uptime()
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Health check on port ${PORT}`));

// ==================== START BOT ====================
if (!CONFIG.token) {
    console.error('❌ DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

client.login(CONFIG.token);
