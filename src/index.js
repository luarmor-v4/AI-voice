// ============================================================
//         DISCORD AI BOT v2.17.0 - DYNAMIC MANAGER
//         Redis API Pool + Model Sync + Voice
//         Updated: Pollinations Free + API Providers
// ============================================================

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType,
    Events
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType
} = require('@discordjs/voice');

const { exec } = require('child_process');
const { createServer } = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DynamicManager = require('./modules/dynamicManager');

// ==================== HEALTH SERVER ====================

const startTime = Date.now();

const healthServer = createServer((req, res) => {
    const status = {
        status: 'ok',
        bot: client?.user?.tag || 'starting...',
        version: '2.17.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        guilds: client?.guilds?.cache?.size || 0,
        conversations: conversations?.size || 0,
        activeVoice: voiceConnections?.size || 0
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
});

healthServer.listen(process.env.PORT || 3000, () => console.log('🌐 Health server ready'));

// ==================== CONFIGURATION ====================

const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    tempPath: './temp',
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    maxConversationMessages: 100,
    maxConversationAge: 7200000,
    rateLimitWindow: 60000,
    rateLimitMax: 30,
    voiceInactivityTimeout: 300000
};

// Initialize Dynamic Manager
const manager = new DynamicManager(process.env.REDIS_URL, CONFIG.adminIds);

// ==================== RATE LIMITER ====================

const rateLimits = new Map();

function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = rateLimits.get(userId);
    if (!userLimit || now > userLimit.resetAt) {
        rateLimits.set(userId, { count: 1, resetAt: now + CONFIG.rateLimitWindow });
        return { allowed: true, remaining: CONFIG.rateLimitMax - 1 };
    }
    if (userLimit.count >= CONFIG.rateLimitMax) {
        return { allowed: false, waitTime: Math.ceil((userLimit.resetAt - now) / 1000) };
    }
    userLimit.count++;
    return { allowed: true, remaining: CONFIG.rateLimitMax - userLimit.count };
}

// ==================== SEARCH SYSTEM ====================

const SEARCH_TRIGGERS = [
    'berita', 'news', 'kabar', 'terbaru', 'hari ini', 'sekarang',
    'latest', 'current', 'today', 'recent', 'update',
    'siapa presiden', 'harga', 'kurs', 'cuaca', 'jadwal',
    'trending', 'viral', '2024', '2025', '2026'
];

function shouldSearch(message) {
    const lower = message.toLowerCase();
    return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

async function searchSerper(query) {
    if (!CONFIG.serperApiKey) return null;
    return new Promise((resolve) => {
        const postData = JSON.stringify({ q: query, gl: 'id', hl: 'id', num: 5 });
        const req = https.request({
            hostname: 'google.serper.dev',
            path: '/search',
            method: 'POST',
            headers: { 'X-API-KEY': CONFIG.serperApiKey, 'Content-Type': 'application/json' },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(res.statusCode === 200 ? JSON.parse(data) : null); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

async function searchTavily(query) {
    if (!CONFIG.tavilyApiKey) return null;
    return new Promise((resolve) => {
        const postData = JSON.stringify({ api_key: CONFIG.tavilyApiKey, query, include_answer: true, max_results: 5 });
        const req = https.request({
            hostname: 'api.tavily.com',
            path: '/search',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(res.statusCode === 200 ? JSON.parse(data) : null); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

async function performSearch(query, provider = 'auto') {
    const now = new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' });
    let result = { timestamp: now, answer: null, facts: [], source: null };
    
    if (provider === 'serper' || provider === 'auto') {
        const serper = await searchSerper(query);
        if (serper) {
            result.source = 'serper';
            if (serper.answerBox) result.answer = serper.answerBox.answer || serper.answerBox.snippet;
            if (serper.organic) result.facts = serper.organic.slice(0, 3).map(o => o.snippet).filter(Boolean);
            if (result.answer || result.facts.length) return result;
        }
    }
    
    if (provider === 'tavily' || provider === 'auto') {
        const tavily = await searchTavily(query);
        if (tavily) {
            result.source = 'tavily';
            if (tavily.answer) result.answer = tavily.answer;
            if (tavily.results) result.facts = tavily.results.slice(0, 3).map(r => r.content?.slice(0, 200)).filter(Boolean);
            if (result.answer || result.facts.length) return result;
        }
    }
    
    return null;
}

function formatSearchContext(data) {
    if (!data) return '';
    let ctx = `\n\n[INFO TERKINI - ${data.timestamp}]\n`;
    if (data.answer) ctx += `Jawaban: ${data.answer}\n`;
    if (data.facts.length) ctx += `Fakta:\n${data.facts.map(f => `- ${f}`).join('\n')}\n`;
    ctx += `\nJawab natural tanpa sebut sumber.`;
    return ctx;
}

// ==================== SYSTEM PROMPT ====================

const SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang cerdas dan friendly.
- Jawab dalam Bahasa Indonesia natural
- Untuk voice: jawab ringkas 2-4 kalimat
- Jangan mengarang fakta
- Boleh pakai emoji secukupnya`;

// ==================== AI PROVIDERS ====================

const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', version: '2.5' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', version: '2.5' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', version: '2.5' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', version: '2.0' },
            { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', version: '2.0' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', version: '1.5' },
            { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', version: '1.5' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', version: '1.5' }
        ]
    },
    groq: {
        name: 'Groq',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', version: '3.3' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', version: '3.1' },
            { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile', version: '3.1' },
            { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B Preview', version: '3.2' },
            { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B Preview', version: '3.2' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B' },
            { id: 'whisper-large-v3', name: 'Whisper Large V3', version: 'v3' },
            { id: 'whisper-large-v3-turbo', name: 'Whisper V3 Turbo', version: 'v3' }
        ]
    },
    openrouter: {
        name: 'OpenRouter',
        models: [
            { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large Preview (free)', version: 'Large' },
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3 (free)', version: 'Pro-3' },
            { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM2.5-1.2B-Thinking (free)', version: '1.2B' },
            { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM2.5-1.2B-Instruct (free)', version: '1.2B' },
            { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B (free)', version: '8B' },
            { id: 'tngtech/deepseek-r1t-chimera:free', name: 'R1T Chimera (free)', version: 'R1T' },
            { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera (free)', version: 'R1T2' },
            { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (free)', version: '4.5' },
            { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Uncensored (free)', version: '24B' },
            { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B (free)', version: '3n' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'R1 0528 (free)', version: '0528' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)', version: '24B' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', version: '2.0' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', version: '70B' },
            { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B (free)', version: '405B' },
            { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', version: 'Coder' },
            { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (free)', version: 'K2' },
            { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B (free)', version: '120B' },
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (free)', version: '405B' }
        ]
    },
    pollinations_free: {
        name: 'Pollinations (Free)',
        requiresKey: false,
        models: [
            // Basic models only - no API key needed
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT' },
            { id: 'claude', name: 'Claude', version: '3.5' },
            { id: 'gemini', name: 'Gemini', version: '2.0' },
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
            { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
            { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
            { id: 'llama', name: 'Llama', version: '3.3' },
            { id: 'mistral', name: 'Mistral', version: 'Small' },
            { id: 'unity', name: 'Unity', version: 'v1' },
            { id: 'midijourney', name: 'Midijourney', version: 'v1' },
            { id: 'rtist', name: 'Rtist', version: 'v1' },
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'evil', name: 'Evil Mode', version: 'Uncensored' },
            { id: 'p1', name: 'P1', version: 'v1' }
        ]
    },
    pollinations_api: {
        name: 'Pollinations (API)',
        requiresKey: true,
        models: [
            // OpenAI Models
            { id: 'openai', name: 'OpenAI GPT', version: 'GPT' },
            { id: 'openai-fast', name: 'OpenAI Fast', version: 'Fast' },
            { id: 'openai-large', name: 'OpenAI Large', version: 'Large' },
            { id: 'openai-reasoning', name: 'OpenAI Reasoning (o3-mini)', version: 'o3' },
            { id: 'openai-audio', name: 'OpenAI Audio (GPT-4o-audio)', version: '4o' },
            // Claude Models
            { id: 'claude', name: 'Claude', version: '3.5' },
            { id: 'claude-fast', name: 'Claude Fast', version: 'Fast' },
            { id: 'claude-large', name: 'Claude Large', version: 'Large' },
            { id: 'claude-haiku', name: 'Claude Haiku', version: 'Haiku' },
            { id: 'claude-sonnet', name: 'Claude Sonnet', version: 'Sonnet' },
            { id: 'claude-opus', name: 'Claude Opus', version: 'Opus' },
            { id: 'claude-hybridspace', name: 'Claude Hybridspace', version: 'Hybrid' },
            // Gemini Models
            { id: 'gemini', name: 'Gemini', version: '2.0' },
            { id: 'gemini-fast', name: 'Gemini Fast', version: 'Fast' },
            { id: 'gemini-large', name: 'Gemini Large', version: 'Large' },
            { id: 'gemini-search', name: 'Gemini Search', version: 'Search' },
            { id: 'gemini-thinking', name: 'Gemini Thinking', version: 'Think' },
            // DeepSeek Models
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
            { id: 'deepseek-v3', name: 'DeepSeek V3', version: 'V3' },
            { id: 'deepseek-r1', name: 'DeepSeek R1', version: 'R1' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', version: 'R1' },
            // Qwen Models
            { id: 'qwen', name: 'Qwen', version: 'Qwen3' },
            { id: 'qwen-coder', name: 'Qwen Coder', version: 'Coder' },
            // Llama Models
            { id: 'llama', name: 'Llama', version: '3.3' },
            { id: 'llamalight', name: 'Llama Light (70B)', version: '70B' },
            { id: 'llama-scaleway', name: 'Llama Scaleway', version: 'SW' },
            // Mistral Models
            { id: 'mistral', name: 'Mistral', version: 'Small' },
            { id: 'mistral-small', name: 'Mistral Small', version: 'Small' },
            { id: 'mistral-large', name: 'Mistral Large', version: 'Large' },
            // Grok Models
            { id: 'grok', name: 'Grok', version: '1.0' },
            { id: 'grok-fast', name: 'Grok Fast', version: 'Fast' },
            // Kimi Models
            { id: 'kimi', name: 'Kimi', version: '1.0' },
            { id: 'kimi-large', name: 'Kimi Large', version: 'Large' },
            { id: 'kimi-reasoning', name: 'Kimi Reasoning', version: 'Think' },
            // Other Models
            { id: 'glm', name: 'GLM', version: '4.0' },
            { id: 'minimax', name: 'MiniMax', version: '1.0' },
            { id: 'nova-fast', name: 'Amazon Nova Fast', version: 'Fast' },
            { id: 'phi', name: 'Microsoft Phi', version: 'Phi' },
            // Search/Tool Models
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'perplexity-fast', name: 'Perplexity Fast', version: 'Fast' },
            { id: 'perplexity-reasoning', name: 'Perplexity Reasoning', version: 'Think' },
            // Creative/Art Models
            { id: 'midijourney', name: 'Midijourney', version: 'v1' },
            { id: 'unity', name: 'Unity', version: 'v1' },
            { id: 'rtist', name: 'Rtist', version: 'v1' },
            // Special Models
            { id: 'evil', name: 'Evil Mode (Uncensored)', version: 'Evil' },
            { id: 'p1', name: 'P1', version: 'v1' },
            { id: 'hormoz', name: 'Hormoz', version: 'v1' },
            { id: 'sur', name: 'Sur', version: 'v1' },
            { id: 'bidara', name: 'Bidara', version: 'v1' },
            // Education/Utility
            { id: 'chickytutor', name: 'ChickyTutor (Education)', version: 'Edu' },
            { id: 'nomnom', name: 'NomNom (Food)', version: 'Food' }
        ]
    },
    huggingface: {
        name: 'HuggingFace',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '8B' },
            { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', version: '70B' },
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '72B' },
            { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', version: '27B' },
            { id: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B', version: '7B' }
        ]
    }
};

const TTS_VOICES = [
    { id: 'id-ID-GadisNeural', name: 'Gadis (ID)', lang: 'id' },
    { id: 'id-ID-ArdiNeural', name: 'Ardi (ID)', lang: 'id' },
    { id: 'en-US-JennyNeural', name: 'Jenny (US)', lang: 'en' },
    { id: 'en-US-GuyNeural', name: 'Guy (US)', lang: 'en' },
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP)', lang: 'ja' }
];

// ==================== DEFAULT SETTINGS ====================

const DEFAULT_SETTINGS = {
    aiProvider: 'gemini',
    aiModel: 'gemini-2.0-flash',
    ttsVoice: 'id-ID-GadisNeural',
    searchEnabled: true,
    searchProvider: 'auto',
    geminiGrounding: true
};

// ==================== CLIENT & STORAGE ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const guildSettings = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();
const ttsQueues = new Map();
const conversations = new Map();

function getSettings(guildId) {
    if (!guildSettings.has(guildId)) guildSettings.set(guildId, { ...DEFAULT_SETTINGS });
    return guildSettings.get(guildId);
}

function updateSettings(guildId, key, value) {
    const s = getSettings(guildId);
    s[key] = value;
}

function isAdmin(userId) {
    return CONFIG.adminIds.includes(userId);
}

// ==================== CONVERSATION MEMORY ====================

function getConversation(guildId, oderId) {
    const key = `${guildId}-${oderId}`;
    if (!conversations.has(key)) {
        conversations.set(key, { messages: [], createdAt: Date.now(), lastActivity: Date.now() });
    }
    const conv = conversations.get(key);
    conv.lastActivity = Date.now();
    return conv;
}

function addToConversation(guildId, oderId, role, content) {
    const conv = getConversation(guildId, oderId);
    conv.messages.push({ role, content, timestamp: Date.now() });
    if (conv.messages.length > CONFIG.maxConversationMessages) {
        conv.messages = conv.messages.slice(-CONFIG.maxConversationMessages);
    }
}

function clearConversation(guildId, oderId) {
    conversations.delete(`${guildId}-${oderId}`);
}

setInterval(() => {
    const now = Date.now();
    for (const [key, conv] of conversations) {
        if (now - conv.lastActivity > CONFIG.maxConversationAge) {
            conversations.delete(key);
        }
    }
}, 300000);

// ==================== UTILITIES ====================

function ensureTempDir() {
    if (!fs.existsSync(CONFIG.tempPath)) {
        fs.mkdirSync(CONFIG.tempPath, { recursive: true });
    }
}

function cleanupFile(filepath) {
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (e) {}
}

function splitMessage(text, maxLength = 1900) {
    if (text.length <= maxLength) return [text];
    const parts = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) { parts.push(remaining); break; }
        let idx = remaining.lastIndexOf('\n', maxLength);
        if (idx === -1 || idx < maxLength / 2) idx = remaining.lastIndexOf('. ', maxLength);
        if (idx === -1 || idx < maxLength / 2) idx = remaining.lastIndexOf(' ', maxLength);
        if (idx === -1) idx = maxLength;
        parts.push(remaining.slice(0, idx + 1));
        remaining = remaining.slice(idx + 1);
    }
    return parts;
}

function cleanTextForTTS(text) {
    return text
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/```[\s\S]*?```/g, ' kode ')
        .replace(/`[^`]+`/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000);
}

// ==================== HTTP HELPER ====================

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

// ==================== AI PROVIDER CALLS ====================

async function callGemini(model, message, history, systemPrompt, useGrounding = false) {
    const apiKey = await manager.getActiveKey('gemini', CONFIG.geminiApiKey);
    if (!apiKey) throw new Error('No Gemini API key');

    const contents = [];
    
    history.slice(-20).forEach(m => {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        });
    });
    
    contents.push({ 
        role: 'user', 
        parts: [{ text: message }] 
    });

    const requestBody = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
    };

    if (useGrounding) {
        requestBody.tools = [{ googleSearch: {} }];
    }

    const { data, statusCode } = await httpRequest({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(requestBody));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
            text: result.candidates[0].content.parts[0].text,
            grounded: !!result.candidates[0]?.groundingMetadata
        };
    }
    
    if (result.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety filters');
    }
    
    throw new Error('No response from Gemini');
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('groq', CONFIG.groqApiKey);
    if (!apiKey) throw new Error('No Groq API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
        }
    }, JSON.stringify({ 
        model, 
        messages, 
        max_completion_tokens: 2000,
        temperature: 0.7 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('openrouter', CONFIG.openrouterApiKey);
    if (!apiKey) throw new Error('No OpenRouter API key');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-30).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

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
    }, JSON.stringify({ 
        model, 
        messages, 
        max_tokens: 2000, 
        temperature: 0.7 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

// ==================== POLLINATIONS FUNCTIONS ====================

async function callPollinationsFree(model, message, history, systemPrompt) {
    // No API key needed - completely free
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const requestBody = JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'text.pollinations.ai',
            path: '/openai',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            },
            timeout: 60000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        if (result.choices?.[0]?.message?.content) {
                            resolve(result.choices[0].message.content);
                        } else {
                            // Fallback to simple endpoint
                            callPollinationsSimple(model, message, history, systemPrompt)
                                .then(resolve)
                                .catch(reject);
                        }
                    } else {
                        callPollinationsSimple(model, message, history, systemPrompt)
                            .then(resolve)
                            .catch(reject);
                    }
                } catch (e) {
                    callPollinationsSimple(model, message, history, systemPrompt)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });

        req.on('error', () => {
            callPollinationsSimple(model, message, history, systemPrompt)
                .then(resolve)
                .catch(reject);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(requestBody);
        req.end();
    });
}

async function callPollinationsApi(model, message, history, systemPrompt) {
    // With API key for priority access
    const apiKey = await manager.getActiveKey('pollinations_api', CONFIG.pollinationsApiKey);
    
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const requestBody = JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
    });

    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
    };

    // Add API key if available
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'text.pollinations.ai',
            path: '/openai',
            method: 'POST',
            headers: headers,
            timeout: 60000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        if (result.choices?.[0]?.message?.content) {
                            resolve(result.choices[0].message.content);
                        } else {
                            // Fallback to simple endpoint
                            callPollinationsSimple(model, message, history, systemPrompt)
                                .then(resolve)
                                .catch(reject);
                        }
                    } else {
                        callPollinationsSimple(model, message, history, systemPrompt)
                            .then(resolve)
                            .catch(reject);
                    }
                } catch (e) {
                    callPollinationsSimple(model, message, history, systemPrompt)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });

        req.on('error', () => {
            callPollinationsSimple(model, message, history, systemPrompt)
                .then(resolve)
                .catch(reject);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(requestBody);
        req.end();
    });
}

async function callPollinationsSimple(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const encoded = encodeURIComponent(prompt.slice(0, 4000));
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
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = await manager.getActiveKey('huggingface', CONFIG.huggingfaceApiKey);
    if (!apiKey) throw new Error('No HuggingFace API key');

    let prompt = systemPrompt + '\n\n';
    history.slice(-10).forEach(m => {
        prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`;
    });
    prompt += `User: ${message}\nAssistant:`;

    const { data, statusCode } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
        }
    }, JSON.stringify({ 
        inputs: prompt, 
        parameters: { 
            max_new_tokens: 1000,
            temperature: 0.7,
            return_full_text: false
        } 
    }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ==================== MAIN AI CALL ====================

async function callAI(guildId, oderId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, searchEnabled, searchProvider, geminiGrounding } = s;
    const start = Date.now();

    const conv = getConversation(guildId, oderId);
    const history = conv.messages;

    let searchContext = '';
    let searchData = null;
    let useGeminiGrounding = false;

    const needsSearch = searchEnabled && shouldSearch(userMessage);

    if (aiProvider === 'gemini' && geminiGrounding && needsSearch) {
        useGeminiGrounding = true;
    } else if (needsSearch) {
        searchData = await performSearch(userMessage, searchProvider);
        if (searchData) searchContext = formatSearchContext(searchData);
    }

    let finalSystemPrompt = SYSTEM_PROMPT + searchContext;
    if (isVoiceMode) finalSystemPrompt += '\n[MODE SUARA: Jawab singkat 2-4 kalimat]';

    try {
        let response, grounded = false;

        switch (aiProvider) {
            case 'gemini':
                const geminiResult = await callGemini(aiModel, userMessage, history, finalSystemPrompt, useGeminiGrounding);
                response = geminiResult.text;
                grounded = geminiResult.grounded;
                break;
            case 'groq':
                response = await callGroq(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'openrouter':
                response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'huggingface':
                response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_free':
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_api':
                response = await callPollinationsApi(aiModel, userMessage, history, finalSystemPrompt);
                break;
            default:
                // Fallback to pollinations_free
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
        }

        addToConversation(guildId, oderId, 'user', userMessage);
        addToConversation(guildId, oderId, 'assistant', response);

        const modelInfo = AI_PROVIDERS[aiProvider]?.models.find(m => m.id === aiModel) || { name: aiModel };

        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: modelInfo.name,
            latency: Date.now() - start,
            searched: !!searchData || grounded,
            searchSource: searchData?.source || (grounded ? 'gemini-grounding' : null)
        };

    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);

        if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
            const rotated = await manager.rotateKey(aiProvider);
            if (rotated) {
                console.log(`🔄 Rotated ${aiProvider} key, retrying...`);
                try {
                    return await callAI(guildId, oderId, userMessage, isVoiceMode);
                } catch (retryError) {
                    console.error('Retry failed:', retryError.message);
                }
            }
        }

        // Fallback to pollinations_free (no key needed)
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            try {
                const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
                addToConversation(guildId, oderId, 'user', userMessage);
                addToConversation(guildId, oderId, 'assistant', fallback);
                return {
                    text: fallback,
                    provider: 'Pollinations Free (Fallback)',
                    model: 'OpenAI GPT',
                    latency: Date.now() - start,
                    searched: !!searchData
                };
            } catch (e) {
                throw new Error(`All providers failed`);
            }
        }
        throw error;
    }
}

// ==================== TTS GENERATION ====================

function generateTTS(text, voice) {
    return new Promise((resolve, reject) => {
        ensureTempDir();
        const outputPath = path.join(CONFIG.tempPath, `tts_${Date.now()}.mp3`);
        const safeText = cleanTextForTTS(text).replace(/"/g, "'").replace(/`/g, "'");

        if (!safeText || safeText.length < 2) return reject(new Error('Text too short'));

        exec(`edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outputPath}"`, 
            { timeout: 30000 }, 
            (err) => {
                if (err) reject(err);
                else resolve(outputPath);
            }
        );
    });
}

// ==================== VOICE FUNCTIONS ====================

async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'Masuk voice channel dulu' };

    try {
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            return { success: true, channel: vc, alreadyConnected: true };
        }

        if (existingConn) {
            existingConn.destroy();
            voiceConnections.delete(guild.id);
            audioPlayers.delete(guild.id);
        }

        const conn = joinVoiceChannel({
            channelId: vc.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false
        });

        await entersState(conn, VoiceConnectionStatus.Ready, 30000);

        const player = createAudioPlayer();
        conn.subscribe(player);

        voiceConnections.set(guild.id, conn);
        audioPlayers.set(guild.id, player);
        ttsQueues.set(guild.id, { queue: [], playing: false, currentFile: null });

        player.on(AudioPlayerStatus.Idle, () => processNextInQueue(guild.id));
        player.on('error', () => processNextInQueue(guild.id));

        return { success: true, channel: vc };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);

    const queueData = ttsQueues.get(guildId);
    if (queueData) {
        if (queueData.currentFile) cleanupFile(queueData.currentFile);
        queueData.queue.forEach(item => cleanupFile(item.file));
    }

    if (!conn) return false;

    conn.destroy();
    voiceConnections.delete(guildId);
    audioPlayers.delete(guildId);
    ttsQueues.delete(guildId);
    return true;
}

function processNextInQueue(guildId) {
    const queueData = ttsQueues.get(guildId);
    if (!queueData) return;

    if (queueData.currentFile) {
        cleanupFile(queueData.currentFile);
        queueData.currentFile = null;
    }

    if (queueData.queue.length === 0) {
        queueData.playing = false;
        return;
    }

    const player = audioPlayers.get(guildId);
    if (!player) return;

    const next = queueData.queue.shift();
    queueData.currentFile = next.file;
    queueData.playing = true;

    try {
        const resource = createAudioResource(next.file, { inputType: StreamType.Arbitrary });
        player.play(resource);
    } catch (e) {
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

async function playTTSInVoice(guildId, filePath) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) {
        queueData = { queue: [], playing: false, currentFile: null };
        ttsQueues.set(guildId, queueData);
    }

    queueData.queue.push({ file: filePath });

    if (!queueData.playing) processNextInQueue(guildId);
    return true;
}

// ==================== SETTINGS UI ====================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const model = ai?.models.find(m => m.id === s.aiModel) || { name: s.aiModel };

    const isFreeProvider = ai?.requiresKey === false;
    const providerNote = isFreeProvider ? ' 🆓' : '';

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .addFields(
            { name: '🧠 AI Provider', value: `**${ai?.name || s.aiProvider}**${providerNote}\n${model.name}`, inline: true },
            { name: '🔊 TTS Voice', value: s.ttsVoice.split('-').slice(-1)[0], inline: true },
            { name: '🔍 Search', value: s.geminiGrounding ? '🟢 Grounding ON' : (s.searchEnabled ? '🟢 ON' : '🔴 OFF'), inline: true }
        )
        .setFooter({ text: 'v2.17.0 • Dynamic Manager | 🆓 = Free Provider' })
        .setTimestamp();
}

function createProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => ({
        label: p.name + (p.requiresKey === false ? ' 🆓' : ''),
        value: k,
        default: k === s.aiProvider,
        description: p.requiresKey === false ? 'No API key needed' : undefined
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 AI Provider').addOptions(opts)
    );
}

function createModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;

    const opts = p.models.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25), value: m.id, default: m.id === s.aiModel
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('🤖 Model').addOptions(opts)
    );
}

function createVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const opts = TTS_VOICES.map(v => ({
        label: v.name, value: v.id, default: v.id === s.ttsVoice
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('🔊 Voice').addOptions(opts)
    );
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('search_toggle').setLabel(s.searchEnabled ? '🔍 Search ON' : '🔍 Search OFF').setStyle(s.searchEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('grounding_toggle').setLabel(s.geminiGrounding ? '🌐 Grounding ON' : '🌐 Grounding OFF').setStyle(s.geminiGrounding ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
}

// ==================== INTERACTION HANDLER ====================

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.customId?.startsWith('dm_')) {
        return manager.handleInteraction(interaction);
    }

    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: '❌ Admin only', ephemeral: true });
    }

    const guildId = interaction.guild.id;

    try {
        if (interaction.customId === 'sel_ai') {
            updateSettings(guildId, 'aiProvider', interaction.values[0]);
            const p = AI_PROVIDERS[interaction.values[0]];
            if (p?.models[0]) updateSettings(guildId, 'aiModel', p.models[0].id);
        } else if (interaction.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', interaction.values[0]);
        } else if (interaction.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', interaction.values[0]);
        } else if (interaction.customId === 'search_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'searchEnabled', !s.searchEnabled);
        } else if (interaction.customId === 'grounding_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'geminiGrounding', !s.geminiGrounding);
        }

        const comps = [createProviderMenu(guildId), createModelMenu(guildId), createVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await interaction.update({ embeds: [createSettingsEmbed(guildId)], components: comps });

    } catch (e) {
        interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }).catch(() => {});
    }
});

// ==================== MESSAGE HANDLER ====================

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const isMentioned = msg.mentions.has(client.user);
    let content = msg.content;

    if (isMentioned) {
        content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (content) return handleAI(msg, content);
    }

    if (!content.startsWith(CONFIG.prefix)) return;

    const args = content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
        switch (cmd) {
            case 'ai': case 'ask': case 'chat':
                if (!args.join(' ')) return msg.reply('❓ `.ai pertanyaan`');
                await handleAI(msg, args.join(' '));
                break;

            case 'join': case 'j':
                const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                await msg.reply(jr.success ? (jr.alreadyConnected ? `✅ Already in **${jr.channel.name}**` : `🔊 Joined **${jr.channel.name}**`) : `❌ ${jr.error}`);
                break;

            case 'leave': case 'dc':
                await msg.reply(await leaveVoiceChannel(msg.guild) ? '👋 Left' : '❌ Not in voice');
                break;

            case 'speak': case 'say':
                await handleSpeak(msg, args.join(' '));
                break;

            case 'stop':
                const player = audioPlayers.get(msg.guild.id);
                if (player) { player.stop(); await msg.reply('⏹️ Stopped'); }
                else await msg.reply('❌ Nothing playing');
                break;

            case 'settings': case 'config':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                const comps = [createProviderMenu(msg.guild.id), createModelMenu(msg.guild.id), createVoiceMenu(msg.guild.id), createModeButtons(msg.guild.id)].filter(Boolean);
                await msg.reply({ embeds: [createSettingsEmbed(msg.guild.id)], components: comps });
                break;

            case 'manage': case 'apimanager': case 'manager':
                await manager.showMainMenu(msg);
                break;

            case 'addapi':
                await manager.quickAddApi(msg, args);
                break;

            case 'listapi': case 'apis':
                await manager.quickListApi(msg);
                break;

            case 'addmodel':
                await manager.quickAddModel(msg, args);
                break;

            case 'syncmodels':
                await manager.quickSyncModels(msg, args[0]);
                break;

            case 'clear': case 'reset':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('🗑️ Conversation cleared!');
                break;

            case 'status':
                const poolStatus = await manager.getPoolStatus();
                let statusText = '**📊 Bot Status v2.17.0**\n\n';
                statusText += `**API Pool:**\n`;
                for (const [p, s] of Object.entries(poolStatus)) {
                    if (s.keys > 0) statusText += `• ${p}: ${s.keys} keys (${s.active} active)\n`;
                }
                statusText += `\n**Free Providers:**\n• pollinations_free: 🟢 No key needed`;
                statusText += `\n\n**Redis:** ${manager.connected ? '🟢 Connected' : '🔴 Disconnected'}`;
                statusText += `\n**Uptime:** ${Math.floor((Date.now() - startTime) / 60000)} min`;
                await msg.reply(statusText);
                break;

            case 'help': case 'h':
                await msg.reply(`**🤖 Aria AI Bot v2.17.0**

**Chat:**
• \`.ai <pertanyaan>\` - Tanya AI
• \`@Aria <pertanyaan>\` - Mention

**Voice:**
• \`.join\` - Gabung voice
• \`.leave\` - Keluar voice
• \`.speak <text>\` - TTS
• \`.stop\` - Stop audio

**Settings:**
• \`.settings\` - Settings panel
• \`.clear\` - Hapus memory

**API Manager (Admin):**
• \`.manage\` - Menu API & Model
• \`.listapi\` - List API pools
• \`.syncmodels <provider>\` - Sync models
• \`.status\` - Bot status

**Free Providers:**
🆓 Pollinations (Free) - No API key needed!`);
                break;

            case 'ping':
                await msg.reply(`🏓 Pong! ${Date.now() - msg.createdTimestamp}ms`);
                break;
        }
    } catch (e) {
        console.error('Command error:', e);
        msg.reply(`❌ ${e.message}`).catch(() => {});
    }
});

// ==================== AI & SPEAK HANDLERS ====================

async function handleAI(msg, query) {
    const rateCheck = checkRateLimit(msg.author.id);
    if (!rateCheck.allowed) return msg.reply(`⏳ Wait ${rateCheck.waitTime}s`);

    let inVoice = false;
    if (msg.member?.voice?.channel) {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) inVoice = true;
    }

    await msg.channel.sendTyping();

    try {
        const response = await callAI(msg.guild.id, msg.author.id, query, inVoice);

        const searchIcon = response.searched ? ` 🔍` : '';
        const info = `*${response.model} • ${response.latency}ms${searchIcon}*`;
        const fullResponse = `${response.text}\n\n-# ${info}`;

        const parts = splitMessage(fullResponse);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) await msg.reply(parts[i]);
            else await msg.channel.send(parts[i]);
        }

        if (inVoice) {
            try {
                const s = getSettings(msg.guild.id);
                const ttsFile = await generateTTS(response.text, s.ttsVoice);
                if (ttsFile) await playTTSInVoice(msg.guild.id, ttsFile);
            } catch (e) {
                console.error('TTS error:', e.message);
            }
        }

    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`❌ ${e.message}`);
    }
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('❓ `.speak Halo dunia`');

    const player = audioPlayers.get(msg.guild.id);
    if (!player) return msg.reply('❌ Join voice channel first (`.join`)');

    const status = await msg.reply('🔊 Generating...');

    try {
        const s = getSettings(msg.guild.id);
        const ttsFile = await generateTTS(text, s.ttsVoice);
        if (ttsFile) {
            await playTTSInVoice(msg.guild.id, ttsFile);
            await status.edit('🔊 Playing...');
        } else {
            await status.edit('❌ TTS failed');
        }
    } catch (e) {
        await status.edit(`❌ ${e.message}`);
    }
}

// ==================== READY ====================

client.once(Events.ClientReady, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🤖 ${client.user.tag} online!`);
    console.log(`📡 ${client.guilds.cache.size} servers`);
    console.log(`📦 v2.17.0 - Dynamic API Manager`);
    console.log('='.repeat(50));
    console.log(`🔗 Redis: ${manager.connected ? '✅' : '❌ (using ENV fallback)'}`);
    console.log(`🔍 Serper: ${CONFIG.serperApiKey ? '✅' : '❌'}`);
    console.log(`🔍 Tavily: ${CONFIG.tavilyApiKey ? '✅' : '❌'}`);
    console.log(`🧠 Gemini: ${CONFIG.geminiApiKey ? '✅' : '❌'}`);
    console.log(`🧠 Groq: ${CONFIG.groqApiKey ? '✅' : '❌'}`);
    console.log(`🧠 OpenRouter: ${CONFIG.openrouterApiKey ? '✅' : '❌'}`);
    console.log(`🧠 HuggingFace: ${CONFIG.huggingfaceApiKey ? '✅' : '❌'}`);
    console.log(`🌸 Pollinations Free: ✅ (No key needed)`);
    console.log(`🌺 Pollinations API: ${CONFIG.pollinationsApiKey ? '✅' : '❌'}`);
    console.log('='.repeat(50) + '\n');

    client.user.setActivity(`.ai | .help`, { type: ActivityType.Listening });
    ensureTempDir();
});

// ==================== ERROR HANDLING ====================

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    voiceConnections.forEach((c) => c.destroy());
    client.destroy();
    process.exit(0);
});

// ==================== START ====================

if (!CONFIG.token) {
    console.error('❌ DISCORD_TOKEN not set!');
    process.exit(1);
}

client.login(CONFIG.token);
