// ============================================================
//         DISCORD AI BOT - MULTI PROVIDER v2.4
//         Pollinations Free/API + OpenRouter Support
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
const { exec } = require('child_process');
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

// ==================== SYSTEM PROMPT ====================
const MASTER_SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang sangat cerdas, jujur, dan helpful seperti Claude AI.

KARAKTERISTIK:
1. Jujur & Transparan - Selalu jujur, akui jika tidak tahu
2. Logis & Analitis - Berpikir step-by-step dengan reasoning jelas
3. Expert Coding - Ahli programming, berikan kode clean dan documented
4. Helpful - Jawaban akurat dan berguna
5. Bahasa Natural - Bahasa Indonesia yang natural dan friendly

ATURAN:
- Voice mode: jawab singkat 2-3 kalimat
- Hindari emoji berlebihan
- Akui keterbatasan jika ada`;

// ==================== AI PROVIDERS ====================
const AI_PROVIDERS = {
    groq: {
        name: 'Groq',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1' },
            { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', version: 'v3.2' },
            { id: 'gemma2-9b-it', name: 'Gemma2 9B', version: 'v2' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B' }
        ]
    },
    pollinations_free: {
        name: 'Pollinations (Free)',
        requiresKey: false,
        models: [
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT-4.1-nano' },
            { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-4.1-large' },
            { id: 'openai-reasoning', name: 'OpenAI Reasoning', version: 'o3-mini' },
            { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
            { id: 'qwen-coder', name: 'Qwen Coder', version: 'Qwen3-Coder' },
            { id: 'llama', name: 'Llama', version: 'Llama-3.3' },
            { id: 'mistral', name: 'Mistral', version: 'Mistral-Small' },
            { id: 'mistral-large', name: 'Mistral Large', version: 'Mistral-Large' },
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
            { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', version: 'R1-Reasoner' },
            { id: 'gemini', name: 'Gemini', version: '2.5-Pro' },
            { id: 'gemini-thinking', name: 'Gemini Thinking', version: '2.5-Thinking' },
            { id: 'claude-hybridspace', name: 'Claude Hybridspace', version: 'Claude-3.5' },
            { id: 'phi', name: 'Phi', version: 'Phi-4' },
            { id: 'unity', name: 'Unity', version: 'v1' },
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'llamalight', name: 'Llama Light', version: 'Llama-3.3-70B' }
        ]
    },
    pollinations_api: {
        name: 'Pollinations (API)',
        requiresKey: true,
        keyEnv: 'POLLINATIONS_API_KEY',
        models: [
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT-4.1' },
            { id: 'openai-fast', name: 'OpenAI Fast', version: 'GPT-4.1-fast' },
            { id: 'openai-large', name: 'OpenAI Large', version: 'GPT-4.1-large' },
            { id: 'claude', name: 'Claude', version: 'Claude-3.5' },
            { id: 'claude-fast', name: 'Claude Fast', version: 'Claude-3.5-fast' },
            { id: 'gemini', name: 'Gemini', version: '2.5-Pro' },
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' }
        ]
    },
    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', version: '4B-free' },
            { id: 'qwen/qwen3-14b:free', name: 'Qwen3 14B', version: '14B-free' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', version: '32B-free' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', version: '72B-free' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', version: 'R1-free' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', version: 'V3-free' },
            { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', version: '4B-free' },
            { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', version: '12B-free' },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', version: '27B-free' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', version: '2.0-free' },
            { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', version: '3B-free' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', version: '70B-free' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 24B', version: '24B-free' },
            { id: 'mistralai/mistral-nemo:free', name: 'Mistral Nemo', version: 'Nemo-free' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B', version: '70B-free' },
            { id: 'thudm/glm-4-9b:free', name: 'GLM 4 9B', version: '9B-free' },
            { id: 'thudm/glm-z1-32b:free', name: 'GLM Z1 32B', version: '32B-free' },
            { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini', version: 'mini-free' },
            { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium', version: 'medium-free' },
            { id: 'openchat/openchat-7b:free', name: 'OpenChat 7B', version: '7B-free' }
        ]
    },
    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '3.1-8B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', version: '7B-v0.3' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini', version: 'mini-4k' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '2.5-72B' }
        ]
    }
};

// ==================== TTS PROVIDERS ====================
const TTS_PROVIDERS = {
    edge: {
        name: 'Edge TTS',
        requiresKey: false,
        voices: [
            { id: 'id-ID-GadisNeural', name: 'Gadis (ID Female)', lang: 'id' },
            { id: 'id-ID-ArdiNeural', name: 'Ardi (ID Male)', lang: 'id' },
            { id: 'en-US-JennyNeural', name: 'Jenny (EN Female)', lang: 'en' },
            { id: 'en-US-GuyNeural', name: 'Guy (EN Male)', lang: 'en' },
            { id: 'en-US-AriaNeural', name: 'Aria (EN Female)', lang: 'en' },
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
            { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', lang: 'multi' },
            { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', lang: 'multi' }
        ]
    }
};

// ==================== DEFAULT SETTINGS ====================
const DEFAULT_SETTINGS = {
    aiProvider: 'pollinations_free',
    aiModel: 'openai',
    ttsProvider: 'edge',
    ttsVoice: 'id-ID-GadisNeural',
    mode: 'voice',
    systemPrompt: MASTER_SYSTEM_PROMPT
};

// ==================== CLIENT & STORAGE ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const guildSettings = new Map();
const conversations = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();

// ==================== UTILITIES ====================
function removeEmojisForTTS(text) {
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
        .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
        .replace(/[\u{1F100}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F900}-\u{1FAFF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/:[a-zA-Z0-9_]+:/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadSettings() {
    try {
        if (fs.existsSync(CONFIG.dataPath)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
            Object.entries(data).forEach(([id, s]) => guildSettings.set(id, { ...DEFAULT_SETTINGS, ...s }));
            console.log(`📂 Loaded ${guildSettings.size} guild settings`);
        }
    } catch (e) { console.error('Load error:', e.message); }
}

function saveSettings() {
    try {
        const dir = path.dirname(CONFIG.dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = {};
        guildSettings.forEach((s, id) => data[id] = s);
        fs.writeFileSync(CONFIG.dataPath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Save error:', e.message); }
}

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const s = getSettings(guildId);
    s[key] = value;
    saveSettings();
}

function isAdmin(userId) { return CONFIG.adminIds.includes(userId); }

function getModelInfo(provider, modelId) {
    const p = AI_PROVIDERS[provider];
    if (!p) return { name: modelId, version: '?' };
    return p.models.find(m => m.id === modelId) || { name: modelId, version: '?' };
}

// ==================== HTTP ====================
function httpRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ data, statusCode: res.statusCode }));
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

function httpRequestBinary(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

// ==================== AI PROVIDERS ====================
async function callAI(guildId, userMessage, history = []) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt } = s;
    const start = Date.now();
    
    try {
        let response;
        switch (aiProvider) {
            case 'groq': response = await callGroq(aiModel, userMessage, history, systemPrompt); break;
            case 'pollinations_free': response = await callPollinationsFree(aiModel, userMessage, history, systemPrompt); break;
            case 'pollinations_api': response = await callPollinationsAPI(aiModel, userMessage, history, systemPrompt); break;
            case 'openrouter': response = await callOpenRouter(aiModel, userMessage, history, systemPrompt); break;
            case 'huggingface': response = await callHuggingFace(aiModel, userMessage, history, systemPrompt); break;
            default: response = await callPollinationsFree('openai', userMessage, history, systemPrompt);
        }
        
        const info = getModelInfo(aiProvider, aiModel);
        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: info.name,
            version: info.version,
            latency: Date.now() - start
        };
    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            const fallback = await callPollinationsFree('openai', userMessage, history, systemPrompt);
            return {
                text: fallback,
                provider: 'Pollinations Free (Fallback)',
                model: 'OpenAI GPT',
                version: 'GPT-4.1-nano',
                latency: Date.now() - start
            };
        }
        throw error;
    }
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: message }];
    
    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_tokens: 1000, temperature: 0.7 }));
    
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callPollinationsFree(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-6).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;
    
    const encoded = encodeURIComponent(prompt.slice(0, 3000));
    const seed = Math.floor(Math.random() * 1000000);
    
    return new Promise((resolve, reject) => {
        https.get(`https://text.pollinations.ai/${encoded}?model=${model}&seed=${seed}`, { timeout: 60000 }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200 && data.trim()) {
                    let r = data.trim();
                    if (r.startsWith('Assistant:')) r = r.slice(10).trim();
                    resolve(r);
                } else reject(new Error(`HTTP ${res.statusCode}`));
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) throw new Error('POLLINATIONS_API_KEY not set');
    
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: message }];
    
    const { data, statusCode } = await httpRequest({
        hostname: 'gen.pollinations.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_tokens: 1000, temperature: 0.7, stream: false }));
    
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
    
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-10), { role: 'user', content: message }];
    
    const { data, statusCode } = await httpRequest({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://discord.com',
            'X-Title': 'Discord AI Bot'
        }
    }, JSON.stringify({ model, messages, max_tokens: 1000, temperature: 0.7, stream: false }));
    
    if (statusCode === 401) throw new Error('Invalid API key');
    if (statusCode === 402) throw new Error('Insufficient credits');
    if (statusCode === 429) throw new Error('Rate limited');
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');
    
    const prompt = `${systemPrompt}\n\nUser: ${message}\nAssistant:`;
    
    const { data } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 500 } }));
    
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ==================== TTS ====================
async function generateTTS(guildId, text) {
    const s = getSettings(guildId);
    const clean = removeEmojisForTTS(text);
    if (!clean || clean.length < 2) return null;
    
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp', { recursive: true });
    const output = `./temp/tts_${Date.now()}.mp3`;
    
    try {
        switch (s.ttsProvider) {
            case 'edge': return await genEdgeTTS(clean, s.ttsVoice, output);
            case 'pollinations': return await genPollinationsTTS(clean, s.ttsVoice, output);
            case 'elevenlabs': return await genElevenLabsTTS(clean, s.ttsVoice, output);
            default: return await genEdgeTTS(clean, 'id-ID-GadisNeural', output);
        }
    } catch (e) {
        console.error(`TTS Error:`, e.message);
        if (s.ttsProvider !== 'edge') return await genEdgeTTS(clean, 'id-ID-GadisNeural', output);
        throw e;
    }
}

function genEdgeTTS(text, voice, output) {
    const safe = text.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').slice(0, 500);
    return new Promise((resolve, reject) => {
        exec(`edge-tts --voice "${voice}" --text "${safe}" --write-media "${output}"`, { timeout: 30000 }, 
            err => err ? reject(err) : resolve(output));
    });
}

function genPollinationsTTS(text, voice, output) {
    const encoded = encodeURIComponent(text.slice(0, 500));
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(output);
        https.get(`https://text.pollinations.ai/${encoded}?model=openai-audio&voice=${voice}`, res => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(output); });
        }).on('error', reject);
    });
}

async function genElevenLabsTTS(text, voiceId, output) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
    
    const response = await httpRequestBinary({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey }
    }, JSON.stringify({ text: text.slice(0, 500), model_id: 'eleven_multilingual_v2' }));
    
    fs.writeFileSync(output, response);
    return output;
}

// ==================== EMBEDS & MENUS ====================
function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const tts = TTS_PROVIDERS[s.ttsProvider];
    const m = getModelInfo(s.aiProvider, s.aiModel);
    
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Settings')
        .addFields(
            { name: '🧠 AI', value: `**${ai?.name}**\n${m.name} (${m.version})`, inline: true },
            { name: '🔊 TTS', value: `**${tts?.name}**\n${s.ttsVoice}`, inline: true },
            { name: '📝 Mode', value: s.mode === 'voice' ? '🔊 Voice' : '📝 Text', inline: true }
        )
        .setTimestamp();
}

function createResponseEmbed(msg, q, r) {
    return new EmbedBuilder()
        .setColor(0x00D166)
        .setAuthor({ name: msg.author.displayName, iconURL: msg.author.displayAvatarURL() })
        .addFields(
            { name: '❓ Question', value: q.slice(0, 1024) },
            { name: '🤖 Answer', value: r.text.slice(0, 1024) }
        )
        .setFooter({ text: `${r.provider} | ${r.model} (${r.version}) | ${r.latency}ms` })
        .setTimestamp();
}

function createAIProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => ({
        label: p.name.slice(0, 25), value: k, default: k === s.aiProvider,
        emoji: (!p.requiresKey || process.env[p.keyEnv]) ? '🟢' : '🔴'
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('AI Provider').addOptions(opts)
    );
}

function createAIModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;
    const opts = p.models.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25), description: m.version, value: m.id, default: m.id === s.aiModel
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('Model').addOptions(opts)
    );
}

function createTTSProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(TTS_PROVIDERS).map(([k, p]) => ({
        label: p.name, value: k, default: k === s.ttsProvider,
        emoji: (!p.requiresKey || process.env[p.keyEnv]) ? '🟢' : '🔴'
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_tts').setPlaceholder('TTS').addOptions(opts)
    );
}

function createTTSVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const p = TTS_PROVIDERS[s.ttsProvider];
    if (!p) return null;
    const opts = p.voices.slice(0, 25).map(v => ({ label: v.name, value: v.id, default: v.id === s.ttsVoice }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('Voice').addOptions(opts)
    );
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mode_text').setLabel('📝 Text').setStyle(s.mode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mode_voice').setLabel('🔊 Voice').setStyle(s.mode === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary)
    );
}

// ==================== COMMANDS ====================
async function handleAsk(msg, q) {
    if (!q) return msg.reply('❓ Usage: `!ask <question>`');
    
    const guildId = msg.guild.id;
    const s = getSettings(guildId);
    
    await msg.channel.sendTyping();
    
    try {
        const key = `${guildId}-${msg.author.id}`;
        const history = conversations.get(key) || [];
        
        const response = await callAI(guildId, q, history);
        
        history.push({ role: 'user', content: q }, { role: 'assistant', content: response.text });
        conversations.set(key, history.slice(-20));
        
        await msg.reply({ embeds: [createResponseEmbed(msg, q, response)] });
        
        if (s.mode === 'voice' && voiceConnections.has(guildId)) {
            try {
                const audio = await generateTTS(guildId, response.text);
                if (audio) {
                    const player = audioPlayers.get(guildId);
                    if (player) {
                        const resource = createAudioResource(audio);
                        player.play(resource);
                        player.once(AudioPlayerStatus.Idle, () => { try { fs.unlinkSync(audio); } catch(e) {} });
                    }
                }
            } catch (e) { console.error('TTS:', e.message); }
        }
    } catch (e) { await msg.reply(`❌ ${e.message}`); }
}

async function showSettings(msg) {
    const guildId = msg.guild.id;
    const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
    await msg.reply({ embeds: [createSettingsEmbed(guildId)], components: comps });
}

async function joinVoice(msg) {
    const vc = msg.member?.voice.channel;
    if (!vc) return msg.reply('❌ Join voice first!');
    
    try {
        const conn = joinVoiceChannel({ channelId: vc.id, guildId: msg.guild.id, adapterCreator: msg.guild.voiceAdapterCreator, selfDeaf: false });
        await entersState(conn, VoiceConnectionStatus.Ready, 30000);
        const player = createAudioPlayer();
        conn.subscribe(player);
        voiceConnections.set(msg.guild.id, conn);
        audioPlayers.set(msg.guild.id, player);
        await msg.reply(`✅ Joined **${vc.name}**`);
    } catch (e) { await msg.reply('❌ Failed to join'); }
}

async function leaveVoice(msg) {
    const conn = voiceConnections.get(msg.guild.id);
    if (!conn) return msg.reply('❌ Not in voice');
    conn.destroy();
    voiceConnections.delete(msg.guild.id);
    audioPlayers.delete(msg.guild.id);
    await msg.reply('👋 Left');
}

async function showHelp(msg) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 AI Bot v2.4')
        .addFields(
            { name: '💬 Chat', value: '`!ask <q>` `!join` `!leave` `!clear`' },
            { name: '⚙️ Admin', value: '`!settings` `!status`' }
        );
    await msg.reply({ embeds: [embed] });
}

async function showStatus(msg) {
    let s = '**🧠 AI Providers:**\n';
    Object.entries(AI_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        s += `${ok ? '🟢' : '🔴'} ${p.name} (${p.models.length})\n`;
    });
    s += '\n**🔊 TTS Providers:**\n';
    Object.entries(TTS_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        s += `${ok ? '🟢' : '🔴'} ${p.name} (${p.voices.length})\n`;
    });
    await msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Status').setDescription(s)] });
}

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async (int) => {
    if (!int.isStringSelectMenu() && !int.isButton()) return;
    if (!isAdmin(int.user.id)) return int.reply({ content: '❌ Admin only', ephemeral: true });
    
    const guildId = int.guild.id;
    
    try {
        if (int.customId === 'sel_ai') {
            const p = AI_PROVIDERS[int.values[0]];
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: '❌ No API key', ephemeral: true });
            updateSettings(guildId, 'aiProvider', int.values[0]);
            updateSettings(guildId, 'aiModel', p.models[0].id);
        } else if (int.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', int.values[0]);
        } else if (int.customId === 'sel_tts') {
            const p = TTS_PROVIDERS[int.values[0]];
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: '❌ No API key', ephemeral: true });
            updateSettings(guildId, 'ttsProvider', int.values[0]);
            updateSettings(guildId, 'ttsVoice', p.voices[0].id);
        } else if (int.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', int.values[0]);
        } else if (int.customId === 'mode_text') {
            updateSettings(guildId, 'mode', 'text');
        } else if (int.customId === 'mode_voice') {
            updateSettings(guildId, 'mode', 'voice');
        }
        
        const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await int.update({ embeds: [createSettingsEmbed(guildId)], components: comps });
    } catch (e) { console.error(e); }
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith(CONFIG.prefix)) return;
    
    const args = msg.content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    try {
        switch (cmd) {
            case 'ask': case 'a': await handleAsk(msg, args.join(' ')); break;
            case 'settings': case 'config':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                await showSettings(msg); break;
            case 'join': await joinVoice(msg); break;
            case 'leave': case 'dc': await leaveVoice(msg); break;
            case 'status': case 'providers': await showStatus(msg); break;
            case 'help': case 'h': await showHelp(msg); break;
            case 'clear':
                conversations.delete(`${msg.guild.id}-${msg.author.id}`);
                await msg.reply('🗑️ Cleared'); break;
        }
    } catch (e) { console.error(e); }
});

// ==================== READY ====================
client.once('ready', () => {
    console.log(`\n🤖 ${client.user.tag} | ${client.guilds.cache.size} servers | v2.4\n`);
    Object.entries(AI_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        console.log(`${ok ? '🟢' : '🔴'} ${p.name} (${p.models.length})`);
    });
    console.log('');
    client.user.setActivity(`${CONFIG.prefix}help`, { type: ActivityType.Listening });
    loadSettings();
});

// ==================== HEALTH CHECK ====================
createServer((req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', bot: client.user?.tag, version: '2.4' }));
}).listen(process.env.PORT || 3000, () => console.log('🌐 Health check ready\n'));

// ==================== START ====================
if (!CONFIG.token) { console.error('❌ No DISCORD_TOKEN'); process.exit(1); }
client.login(CONFIG.token);
