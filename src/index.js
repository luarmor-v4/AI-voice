// ============================================================
//         DISCORD AI BOT - MULTI PROVIDER v2.11
//         Tavily + Serper Search | Gemini AI | Natural TTS
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
    AttachmentBuilder
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

// ==================== HEALTH SERVER ====================

const startTime = Date.now();

const healthServer = createServer((req, res) => {
    const status = {
        status: 'ok',
        bot: client?.user?.tag || 'starting...',
        version: '2.11.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        guilds: client?.guilds?.cache?.size || 0,
        conversations: conversations?.size || 0,
        activeVoice: voiceConnections?.size || 0,
        features: ['tavily', 'serper', 'gemini', 'natural-tts', 'unlimited-memory']
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
});

healthServer.listen(process.env.PORT || 3000, () => console.log('🌐 Health server ready'));

// ==================== KONFIGURASI ====================

const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    prefix: '.',
    adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean),
    dataPath: './data/settings.json',
    tempPath: './temp',
    tavilyApiKey: process.env.TAVILY_API_KEY,
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    ttsMaxChunkLength: 1000,
    ttsMaxTotalLength: 10000,
    ttsMinChunkLength: 50,
    ttsConcatTimeout: 120000,
    ttsGenerateTimeout: 60000,
    voiceInactivityTimeout: 300000
};

// ==================== SEARCH SYSTEM ====================

const SEARCH_TRIGGERS = [
    'berita', 'news', 'kabar', 'terbaru', 'hari ini', 'sekarang',
    'latest', 'current', 'today', 'recent', 'update', 'kemarin',
    'siapa presiden', 'siapa menteri', 'harga', 'kurs', 'cuaca',
    'jadwal', 'skor', 'hasil', 'pertandingan', 'match', 'score',
    'trending', 'viral', 'populer', 'terkini', 'breaking',
    'what is happening', 'what happened', 'who won', 'who is',
    'kapan', 'dimana', 'when', 'where', 'how much', 'berapa',
    '2024', '2025', '2026', '2027'
];

function shouldSearch(message) {
    const lower = message.toLowerCase();
    return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

function getCurrentDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    };
    return now.toLocaleDateString('id-ID', options) + ' WIB';
}

// ==================== TAVILY SEARCH ====================

async function searchTavily(query, options = {}) {
    if (!CONFIG.tavilyApiKey) return null;

    const searchParams = {
        api_key: CONFIG.tavilyApiKey,
        query: query,
        search_depth: options.depth || 'basic',
        include_answer: true,
        include_raw_content: false,
        max_results: options.maxResults || 5
    };

    return new Promise((resolve) => {
        const postData = JSON.stringify(searchParams);

        const req = https.request({
            hostname: 'api.tavily.com',
            path: '/search',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

// ==================== SERPER SEARCH ====================

async function searchSerper(query, options = {}) {
    if (!CONFIG.serperApiKey) return null;

    const searchParams = {
        q: query,
        gl: options.country || 'id',
        hl: options.language || 'id',
        num: options.maxResults || 5,
        autocorrect: true
    };

    const endpoint = options.type === 'news' 
        ? 'https://google.serper.dev/news' 
        : 'https://google.serper.dev/search';

    return new Promise((resolve) => {
        const postData = JSON.stringify(searchParams);

        const req = https.request(endpoint, {
            method: 'POST',
            headers: {
                'X-API-KEY': CONFIG.serperApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
    });
}

// ==================== COMBINED SEARCH ====================

async function performSearch(query) {
    const dateTime = getCurrentDateTime();
    let searchData = {
        timestamp: dateTime,
        answer: null,
        facts: [],
        source: null
    };

    // Try Serper first (faster, Google-like)
    if (CONFIG.serperApiKey) {
        console.log('🔍 Searching with Serper...');
        const serperResult = await searchSerper(query);

        if (serperResult) {
            searchData.source = 'serper';

            if (serperResult.answerBox) {
                searchData.answer = serperResult.answerBox.answer || 
                                   serperResult.answerBox.snippet ||
                                   serperResult.answerBox.title;
            }

            if (serperResult.organic && serperResult.organic.length > 0) {
                serperResult.organic.slice(0, 4).forEach(item => {
                    if (item.snippet) {
                        searchData.facts.push(item.snippet);
                    }
                });
            }

            if (serperResult.knowledgeGraph) {
                const kg = serperResult.knowledgeGraph;
                if (kg.description) {
                    searchData.facts.unshift(kg.description);
                }
            }

            if (searchData.answer || searchData.facts.length > 0) {
                console.log('✅ Serper found results');
                return searchData;
            }
        }
    }

    // Fallback to Tavily
    if (CONFIG.tavilyApiKey) {
        console.log('🔍 Searching with Tavily...');
        const tavilyResult = await searchTavily(query);

        if (tavilyResult) {
            searchData.source = 'tavily';

            if (tavilyResult.answer) {
                searchData.answer = tavilyResult.answer;
            }

            if (tavilyResult.results && tavilyResult.results.length > 0) {
                tavilyResult.results.slice(0, 4).forEach(item => {
                    if (item.content) {
                        searchData.facts.push(item.content.slice(0, 300));
                    }
                });
            }

            if (searchData.answer || searchData.facts.length > 0) {
                console.log('✅ Tavily found results');
                return searchData;
            }
        }
    }

    return null;
}

// ==================== NATURAL SEARCH CONTEXT ====================

function formatSearchForAI(searchData) {
    if (!searchData) return '';

    let context = `\n\n[INFORMASI TERKINI - ${searchData.timestamp}]\n`;

    if (searchData.answer) {
        context += `Jawaban langsung: ${searchData.answer}\n`;
    }

    if (searchData.facts.length > 0) {
        context += `Fakta terkait:\n`;
        searchData.facts.forEach((fact, i) => {
            context += `- ${fact}\n`;
        });
    }

    context += `\nGunakan informasi di atas untuk menjawab dengan natural. `;
    context += `Jangan sebutkan "menurut sumber" atau baca URL. `;
    context += `Jawab seolah kamu yang tahu informasinya. `;
    context += `Jika ditanya kapan info ini, sebutkan waktu: ${searchData.timestamp}`;

    return context;
}

function formatSearchForDisplay(searchData, query) {
    if (!searchData) return null;

    let display = `🔍 **Hasil pencarian:** "${query}"\n`;
    display += `📅 *${searchData.timestamp}*\n\n`;

    if (searchData.answer) {
        display += `**Jawaban:**\n${searchData.answer}\n\n`;
    }

    if (searchData.facts.length > 0) {
        display += `**Info terkait:**\n`;
        searchData.facts.slice(0, 3).forEach((fact, i) => {
            display += `${i + 1}. ${fact.slice(0, 200)}...\n\n`;
        });
    }

    return display;
}

// ==================== SYSTEM PROMPT ====================

const MASTER_SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang cerdas, friendly, dan helpful.

## KEPRIBADIAN:
- Bijaksana dan berpengetahuan luas
- Jujur - jangan mengarang fakta
- Friendly tapi profesional
- Bisa serius dan bisa santai

## GAYA BICARA:
- Bahasa Indonesia natural dan mengalir
- Jawaban lengkap tapi tidak bertele-tele
- Boleh pakai emoji secukupnya
- Untuk voice: jawab ringkas 2-4 kalimat

## ATURAN PENTING SAAT MENJAWAB DENGAN INFO DARI INTERNET:
1. JANGAN katakan "menurut sumber" atau "berdasarkan pencarian"
2. JANGAN baca URL atau link apapun
3. JANGAN sebutkan nama website sumber
4. Jawab NATURAL seolah kamu yang tahu informasinya
5. Jika ditanya kapan dapat info, sebutkan waktu yang diberikan
6. Sampaikan informasi dengan gaya percakapan biasa

## CONTOH YANG BENAR:
User: "Siapa presiden Indonesia sekarang?"
Aria: "Presiden Indonesia saat ini adalah Prabowo Subianto, yang dilantik pada Oktober 2024. Beliau sebelumnya menjabat sebagai Menteri Pertahanan."

## CONTOH YANG SALAH:
"Menurut informasi dari internet..." ❌
"Berdasarkan sumber yang saya temukan..." ❌
"Dari website kompas.com..." ❌`;

// ==================== AI PROVIDERS ====================

const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        requiresKey: true,
        keyEnv: 'GEMINI_API_KEY',
        models: [
            { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', version: '2.5-flash', category: 'latest' },
            { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', version: '2.5-pro', category: 'latest' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', version: '2.0-flash', category: 'stable' },
            { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', version: '2.0-lite', category: 'stable' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', version: '1.5-flash', category: 'stable' },
            { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', version: '1.5-8b', category: 'stable' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', version: '1.5-pro', category: 'stable' }
        ]
    },

    groq: {
        name: 'Groq',
        requiresKey: true,
        keyEnv: 'GROQ_API_KEY',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', version: 'v3.3', category: 'production' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', version: 'v3.1', category: 'production' },
            { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B', version: 'v3.2-1B', category: 'production' },
            { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B', version: 'v3.2-3B', category: 'production' },
            { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision', version: 'v3.2-11B', category: 'vision' },
            { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', version: 'v3.2-90B', category: 'vision' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B', category: 'production' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', version: '8x7B', category: 'production' },
            { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', version: '32B', category: 'preview' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E', category: 'preview' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E', category: 'preview' },
            { id: 'mistral-saba-24b', name: 'Mistral Saba 24B', version: '24B', category: 'production' },
            { id: 'whisper-large-v3', name: 'Whisper Large V3', version: 'v3', category: 'stt' },
            { id: 'whisper-large-v3-turbo', name: 'Whisper V3 Turbo', version: 'v3-turbo', category: 'stt' }
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
            { id: 'midijourney', name: 'Midijourney', version: 'v1' },
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'llamalight', name: 'Llama Light', version: 'Llama-3.3-70B' }
        ]
    },

    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            { id: 'google/gemini-2.5-flash-preview:free', name: 'Gemini 2.5 Flash', version: '2.5-flash', category: 'google' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', version: '2.0-free', category: 'google' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', version: 'R1-free', category: 'deepseek' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', version: 'V3-free', category: 'deepseek' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528', version: 'R1-0528', category: 'deepseek' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', version: '32B-free', category: 'qwen' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', version: '72B-free', category: 'qwen' },
            { id: 'qwen/qwq-32b:free', name: 'QwQ 32B', version: 'QwQ-32B', category: 'qwen' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', version: '70B-free', category: 'meta' },
            { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 11B Vision', version: '11B-vision', category: 'meta' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 24B', version: '24B-free', category: 'mistral' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B', version: '70B-free', category: 'nvidia' },
            { id: 'thudm/glm-4.5-air:free', name: 'GLM 4.5 Air', version: '4.5-air', category: 'thudm' },
            { id: 'thudm/glm-z1-32b:free', name: 'GLM Z1 32B', version: '32B-free', category: 'thudm' },
            { id: 'microsoft/phi-4:free', name: 'Phi-4', version: 'phi4-free', category: 'microsoft' },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', version: '27B-free', category: 'google' },
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', version: '405B-free', category: 'other' }
        ]
    },

    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '3.1-8B' },
            { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', version: '3.3-70B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', version: '7B-v0.3' },
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini', version: 'mini-4k' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '2.5-72B' },
            { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', version: '2-27B' }
        ]
    }
};

// ==================== TTS PROVIDERS ====================

const TTS_PROVIDERS = {
    edge: {
        name: 'Edge TTS',
        requiresKey: false,
        voices: [
            { id: 'id-ID-GadisNeural', name: 'Gadis (ID)', lang: 'id' },
            { id: 'id-ID-ArdiNeural', name: 'Ardi (ID)', lang: 'id' },
            { id: 'en-US-JennyNeural', name: 'Jenny (US)', lang: 'en' },
            { id: 'en-US-GuyNeural', name: 'Guy (US)', lang: 'en' },
            { id: 'en-US-AriaNeural', name: 'Aria (US)', lang: 'en' },
            { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', lang: 'en' },
            { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP)', lang: 'ja' },
            { id: 'ko-KR-SunHiNeural', name: 'SunHi (KR)', lang: 'ko' },
            { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN)', lang: 'zh' },
            { id: 'de-DE-KatjaNeural', name: 'Katja (DE)', lang: 'de' },
            { id: 'fr-FR-DeniseNeural', name: 'Denise (FR)', lang: 'fr' },
            { id: 'es-ES-ElviraNeural', name: 'Elvira (ES)', lang: 'es' }
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
    ttsOutput: 'auto',
    searchEnabled: true,
    searchProvider: 'auto',
    systemPrompt: MASTER_SYSTEM_PROMPT
};

// ==================== CLIENT & STORAGE ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const guildSettings = new Map();
const voiceConnections = new Map();
const audioPlayers = new Map();
const ttsQueues = new Map();
const voiceTimeouts = new Map();
const conversations = new Map();

// ==================== CONVERSATION MEMORY ====================

function getConversation(guildId, oderId) {
    const key = `${guildId}-${oderId}`;
    if (!conversations.has(key)) {
        conversations.set(key, {
            messages: [],
            createdAt: Date.now(),
            lastActivity: Date.now()
        });
    }
    const conv = conversations.get(key);
    conv.lastActivity = Date.now();
    return conv;
}

function addToConversation(guildId, oderId, role, content) {
    const conv = getConversation(guildId, oderId);
    conv.messages.push({ role, content, timestamp: Date.now() });
    return conv;
}

function clearConversation(guildId, oderId) {
    conversations.delete(`${guildId}-${oderId}`);
}

function getConversationInfo(guildId, oderId) {
    const key = `${guildId}-${oderId}`;
    if (!conversations.has(key)) return null;
    const conv = conversations.get(key);
    return {
        messageCount: conv.messages.length,
        ageMinutes: Math.floor((Date.now() - conv.createdAt) / 60000),
        lastActiveMinutes: Math.floor((Date.now() - conv.lastActivity) / 60000)
    };
}

// ==================== UTILITIES ====================

function ensureTempDir() {
    if (!fs.existsSync(CONFIG.tempPath)) {
        fs.mkdirSync(CONFIG.tempPath, { recursive: true });
    }
}

function cleanupFile(filepath) {
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (e) {}
}

function cleanupFiles(files) {
    if (Array.isArray(files)) files.forEach(f => cleanupFile(f));
    else cleanupFile(files);
}

function cleanupSessionFiles(sessionId) {
    try {
        const files = fs.readdirSync(CONFIG.tempPath).filter(f => f.includes(sessionId));
        files.forEach(f => cleanupFile(path.join(CONFIG.tempPath, f)));
    } catch (e) {}
}

setInterval(() => {
    try {
        const files = fs.readdirSync(CONFIG.tempPath);
        const now = Date.now();
        files.forEach(f => {
            const filepath = path.join(CONFIG.tempPath, f);
            const stat = fs.statSync(filepath);
            if (now - stat.mtimeMs > 600000) cleanupFile(filepath);
        });
    } catch (e) {}
}, 300000);

// Clean text for TTS - remove URLs, sources, etc
function cleanTextForTTS(text) {
    return text
        // Remove URLs
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/www\.[^\s]+/g, '')
        // Remove markdown links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove source references
        .replace(/sumber:?[^\n]*/gi, '')
        .replace(/source:?[^\n]*/gi, '')
        .replace(/referensi:?[^\n]*/gi, '')
        // Remove emojis
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
        .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
        .replace(/[\u{1F100}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F900}-\u{1FAFF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[\u{200D}]/gu, '')
        .replace(/:[a-zA-Z0-9_]+:/g, '')
        // Remove code blocks
        .replace(/```[\w]*\n?([\s\S]*?)```/g, (m, code) => ` kode ${code.trim().split('\n').length} baris `)
        .replace(/`([^`]+)`/g, '$1')
        // Remove markdown
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Clean whitespace
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTextForTTS(text, maxLength = CONFIG.ttsMaxChunkLength) {
    const clean = cleanTextForTTS(text);
    if (!clean || clean.length < CONFIG.ttsMinChunkLength) return [];
    
    const limitedText = clean.slice(0, CONFIG.ttsMaxTotalLength);
    if (limitedText.length <= maxLength) return [limitedText];
    
    const chunks = [];
    let remaining = limitedText;
    
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            if (remaining.trim().length >= CONFIG.ttsMinChunkLength) chunks.push(remaining.trim());
            break;
        }
        
        let splitIndex = -1;
        const searchArea = remaining.slice(0, maxLength);
        
        const sentenceMatches = [...searchArea.matchAll(/[.!?]\s+(?=[A-Z\u0400-\u04FF\u4e00-\u9fff])/g)];
        if (sentenceMatches.length > 0) {
            const lastMatch = sentenceMatches[sentenceMatches.length - 1];
            if (lastMatch.index > maxLength / 3) splitIndex = lastMatch.index + 1;
        }
        
        if (splitIndex === -1) {
            const lastPeriod = searchArea.lastIndexOf('. ');
            const lastQuestion = searchArea.lastIndexOf('? ');
            const lastExclaim = searchArea.lastIndexOf('! ');
            splitIndex = Math.max(lastPeriod, lastQuestion, lastExclaim);
            if (splitIndex > 0 && splitIndex > maxLength / 3) splitIndex += 1;
            else splitIndex = -1;
        }
        
        if (splitIndex === -1) {
            const lastComma = searchArea.lastIndexOf(', ');
            splitIndex = lastComma > maxLength / 3 ? lastComma + 1 : -1;
        }
        
        if (splitIndex === -1) {
            splitIndex = searchArea.lastIndexOf(' ');
            if (splitIndex < maxLength / 4) splitIndex = -1;
        }
        
        if (splitIndex === -1) splitIndex = maxLength;
        
        const chunk = remaining.slice(0, splitIndex).trim();
        if (chunk.length >= CONFIG.ttsMinChunkLength) chunks.push(chunk);
        remaining = remaining.slice(splitIndex).trim();
    }
    
    return chunks.filter(c => c.length >= CONFIG.ttsMinChunkLength);
}

function loadSettings() {
    try {
        if (fs.existsSync(CONFIG.dataPath)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.dataPath, 'utf8'));
            Object.entries(data).forEach(([id, s]) => guildSettings.set(id, { ...DEFAULT_SETTINGS, ...s }));
            console.log(`📂 Loaded ${guildSettings.size} settings`);
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

function isAdmin(oderId) {
    return CONFIG.adminIds.includes(oderId);
}

function getModelInfo(provider, modelId) {
    const p = AI_PROVIDERS[provider];
    if (!p) return { name: modelId, version: '?' };
    return p.models.find(m => m.id === modelId) || { name: modelId, version: '?' };
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

async function callGemini(model, message, history, systemPrompt) {
    const apiKey = CONFIG.geminiApiKey;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const contents = [];

    // Add history
    history.slice(-40).forEach(m => {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        });
    });

    // Add current message
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
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

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

    if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
        return result.candidates[0].content.parts[0].text;
    }

    throw new Error('No response from Gemini');
}

async function callGroq(model, message, history, systemPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const modelInfo = AI_PROVIDERS.groq.models.find(m => m.id === model);
    if (modelInfo && ['guard', 'tts', 'stt'].includes(modelInfo.category)) {
        throw new Error(`Model ${model} is not a chat model`);
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-50).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];

    const { data, statusCode } = await httpRequest({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7 }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callPollinationsFree(model, message, history, systemPrompt) {
    let prompt = systemPrompt + '\n\n';
    history.slice(-20).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;

    const encoded = encodeURIComponent(prompt.slice(0, 8000));
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

async function callOpenRouter(model, message, history, systemPrompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-50).map(m => ({ role: m.role, content: m.content })),
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
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7 }));

    if (statusCode !== 200) {
        const result = JSON.parse(data);
        throw new Error(result.error?.message || `HTTP ${statusCode}`);
    }

    const result = JSON.parse(data);
    return result.choices[0].message.content;
}

async function callHuggingFace(model, message, history, systemPrompt) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

    let prompt = systemPrompt + '\n\n';
    history.slice(-20).forEach(m => prompt += m.role === 'user' ? `User: ${m.content}\n` : `Assistant: ${m.content}\n`);
    prompt += `User: ${message}\nAssistant:`;

    const { data } = await httpRequest({
        hostname: 'api-inference.huggingface.co',
        path: `/models/${model}`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 1000 } }));

    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error);
    const text = Array.isArray(result) ? result[0].generated_text : result.generated_text;
    return text.split('Assistant:').pop().trim();
}

// ==================== MAIN AI CALL ====================

async function callAI(guildId, oderId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt, searchEnabled } = s;
    const start = Date.now();

    const conv = getConversation(guildId, oderId);
    const history = conv.messages;

    let searchContext = '';
    let searchData = null;

    // Perform search if enabled
    if (searchEnabled && (CONFIG.tavilyApiKey || CONFIG.serperApiKey) && shouldSearch(userMessage)) {
        console.log('🔍 Searching:', userMessage.slice(0, 50));
        searchData = await performSearch(userMessage);
        if (searchData) {
            searchContext = formatSearchForAI(searchData);
            console.log('✅ Search completed via', searchData.source);
        }
    }

    // Build final prompt
    let finalSystemPrompt = systemPrompt;
    if (searchContext) {
        finalSystemPrompt += searchContext;
    }
    if (isVoiceMode) {
        finalSystemPrompt += '\n\n[MODE SUARA: Jawab singkat 2-4 kalimat, natural untuk didengarkan]';
    }

    try {
        let response;

        switch (aiProvider) {
            case 'gemini':
                response = await callGemini(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'groq':
                response = await callGroq(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'pollinations_free':
                response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'openrouter':
                response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt);
                break;
            case 'huggingface':
                response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt);
                break;
            default:
                response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }

        addToConversation(guildId, oderId, 'user', userMessage);
        addToConversation(guildId, oderId, 'assistant', response);

        const info = getModelInfo(aiProvider, aiModel);

        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: info.name,
            version: info.version,
            latency: Date.now() - start,
            searched: !!searchData,
            searchSource: searchData?.source
        };

    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);

        // Fallback
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations...');
            const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
            addToConversation(guildId, oderId, 'user', userMessage);
            addToConversation(guildId, oderId, 'assistant', fallback);
            return {
                text: fallback,
                provider: 'Pollinations (Fallback)',
                model: 'OpenAI GPT',
                version: 'GPT-4.1-nano',
                latency: Date.now() - start,
                searched: !!searchData
            };
        }

        throw error;
    }
}

// ==================== TTS GENERATION ====================

function generateSingleTTSChunk(text, voice, provider, outputPath) {
    return new Promise((resolve, reject) => {
        const safeText = text.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/\n/g, ' ').trim();

        if (!safeText || safeText.length < 2) return reject(new Error('Text too short'));

        const timeout = setTimeout(() => reject(new Error('TTS timeout')), CONFIG.ttsGenerateTimeout);

        switch (provider) {
            case 'edge':
                exec(`edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outputPath}"`, { timeout: CONFIG.ttsGenerateTimeout }, (err) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(outputPath);
                });
                break;

            case 'pollinations':
                const encoded = encodeURIComponent(safeText);
                const file = fs.createWriteStream(outputPath);
                https.get(`https://text.pollinations.ai/${encoded}?model=openai-audio&voice=${voice}`, res => {
                    clearTimeout(timeout);
                    if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve(outputPath); });
                }).on('error', (e) => { clearTimeout(timeout); reject(e); });
                break;

            case 'elevenlabs':
                (async () => {
                    try {
                        const apiKey = process.env.ELEVENLABS_API_KEY;
                        if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
                        const response = await httpRequestBinary({
                            hostname: 'api.elevenlabs.io',
                            path: `/v1/text-to-speech/${voice}`,
                            method: 'POST',
                            headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey }
                        }, JSON.stringify({ text: safeText, model_id: 'eleven_multilingual_v2' }));
                        clearTimeout(timeout);
                        fs.writeFileSync(outputPath, response);
                        resolve(outputPath);
                    } catch (e) { clearTimeout(timeout); reject(e); }
                })();
                break;

            default:
                exec(`edge-tts --voice "id-ID-GadisNeural" --text "${safeText}" --write-media "${outputPath}"`, { timeout: CONFIG.ttsGenerateTimeout }, (err) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(outputPath);
                });
        }
    });
}

function concatenateAudioFiles(inputFiles, outputPath) {
    return new Promise((resolve, reject) => {
        if (inputFiles.length === 0) return reject(new Error('No input'));
        if (inputFiles.length === 1) {
            try { fs.copyFileSync(inputFiles[0], outputPath); return resolve(outputPath); }
            catch (e) { return reject(e); }
        }

        const listPath = outputPath.replace('.mp3', '_list.txt');
        const listContent = inputFiles.map(f => `file '${path.resolve(f)}'`).join('\n');

        try { fs.writeFileSync(listPath, listContent); }
        catch (e) { return reject(e); }

        exec(`ffmpeg -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}" -y`, { timeout: CONFIG.ttsConcatTimeout }, (err) => {
            cleanupFile(listPath);
            if (err) reject(err);
            else resolve(outputPath);
        });
    });
}

async function generateTTS(guildId, text, progressCallback = null) {
    const s = getSettings(guildId);
    ensureTempDir();

    const chunks = splitTextForTTS(text, CONFIG.ttsMaxChunkLength);
    if (chunks.length === 0) return null;

    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const chunkFiles = [];

    console.log(`🔊 TTS: ${chunks.length} chunks`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = path.join(CONFIG.tempPath, `tts_${sessionId}_chunk${i}.mp3`);
            if (progressCallback) progressCallback(i + 1, chunks.length);

            try {
                await generateSingleTTSChunk(chunks[i], s.ttsVoice, s.ttsProvider, chunkPath);
                if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) chunkFiles.push(chunkPath);
            } catch (e) {
                console.error(`TTS chunk ${i} error:`, e.message);
                if (s.ttsProvider !== 'edge') {
                    try {
                        await generateSingleTTSChunk(chunks[i], 'id-ID-GadisNeural', 'edge', chunkPath);
                        if (fs.existsSync(chunkPath)) chunkFiles.push(chunkPath);
                    } catch (e2) {}
                }
            }
        }

        if (chunkFiles.length === 0) throw new Error('No TTS generated');

        if (chunkFiles.length === 1) return { type: 'single', file: chunkFiles[0], sessionId };

        const combinedPath = path.join(CONFIG.tempPath, `tts_${sessionId}_combined.mp3`);

        try {
            await concatenateAudioFiles(chunkFiles, combinedPath);
            cleanupFiles(chunkFiles);
            return { type: 'combined', file: combinedPath, sessionId, chunkCount: chunks.length };
        } catch (e) {
            return { type: 'chunks', files: chunkFiles, sessionId, chunkCount: chunks.length };
        }

    } catch (error) {
        cleanupSessionFiles(sessionId);
        throw error;
    }
}

// ==================== VOICE FUNCTIONS ====================

function resetVoiceTimeout(guildId) {
    if (voiceTimeouts.has(guildId)) clearTimeout(voiceTimeouts.get(guildId));

    const timeout = setTimeout(() => {
        const conn = voiceConnections.get(guildId);
        if (conn) leaveVoiceChannel({ id: guildId });
    }, CONFIG.voiceInactivityTimeout);

    voiceTimeouts.set(guildId, timeout);
}

async function joinUserVoiceChannel(member, guild) {
    const vc = member?.voice?.channel;
    if (!vc) return { success: false, error: 'Masuk voice channel dulu' };

    try {
        const existingConn = getVoiceConnection(guild.id);
        if (existingConn && existingConn.joinConfig.channelId === vc.id) {
            resetVoiceTimeout(guild.id);
            return { success: true, channel: vc, alreadyConnected: true };
        }

        if (existingConn) {
            existingConn.destroy();
            voiceConnections.delete(guild.id);
            audioPlayers.delete(guild.id);
            ttsQueues.delete(guild.id);
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

        resetVoiceTimeout(guild.id);
        return { success: true, channel: vc };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);

    if (voiceTimeouts.has(guildId)) {
        clearTimeout(voiceTimeouts.get(guildId));
        voiceTimeouts.delete(guildId);
    }

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
        resetVoiceTimeout(guildId);
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
        resetVoiceTimeout(guildId);
    } catch (e) {
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

function addToTTSQueue(guildId, ttsResult) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) {
        queueData = { queue: [], playing: false, currentFile: null };
        ttsQueues.set(guildId, queueData);
    }

    if (ttsResult.type === 'single' || ttsResult.type === 'combined') {
        queueData.queue.push({ file: ttsResult.file });
    } else if (ttsResult.type === 'chunks') {
        ttsResult.files.forEach(file => queueData.queue.push({ file }));
    }

    if (!queueData.playing) processNextInQueue(guildId);
}

async function playTTSInVoice(guildId, ttsResult) {
    const player = audioPlayers.get(guildId);
    if (!player) return false;
    addToTTSQueue(guildId, ttsResult);
    return true;
}

async function sendTTSAsFile(channel, ttsResult) {
    try {
        let filePath;
        let cleanup = [];

        if (ttsResult.type === 'single' || ttsResult.type === 'combined') {
            filePath = ttsResult.file;
        } else if (ttsResult.type === 'chunks') {
            const combinedPath = path.join(CONFIG.tempPath, `tts_${ttsResult.sessionId}_forfile.mp3`);
            try {
                await concatenateAudioFiles(ttsResult.files, combinedPath);
                filePath = combinedPath;
                cleanup = ttsResult.files;
            } catch (e) {
                filePath = ttsResult.files[0];
                cleanup = ttsResult.files.slice(1);
            }
        }

        const attachment = new AttachmentBuilder(filePath, { name: `aria_${Date.now()}.mp3` });
        await channel.send({ files: [attachment] });

        cleanupFile(filePath);
        cleanupFiles(cleanup);
        return true;

    } catch (e) {
        console.error('TTS file error:', e.message);
        return false;
    }
}

// ==================== SETTINGS UI ====================

function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const tts = TTS_PROVIDERS[s.ttsProvider];
    const m = getModelInfo(s.aiProvider, s.aiModel);
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);

    const searchStatus = (CONFIG.tavilyApiKey || CONFIG.serperApiKey)
        ? (s.searchEnabled ? '🟢 On' : '🔴 Off')
        : '⚫ No Key';

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .setDescription(`**${totalModels}** models • Search: ${searchStatus}`)
        .addFields(
            { name: '🧠 AI', value: `**${ai?.name}**\n${m.name}`, inline: true },
            { name: '🔊 TTS', value: `**${tts?.name}**\n${s.ttsVoice.split('-').pop()}`, inline: true },
            { name: '📝 Mode', value: s.mode === 'voice' ? '🔊 Voice' : '📝 Text', inline: true }
        )
        .setFooter({ text: 'Search: Serper + Tavily | Memory: Unlimited' })
        .setTimestamp();
}

function createAIProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const n = p.models.filter(m => !['guard', 'stt'].includes(m.category)).length;
        return { label: p.name.slice(0, 25), value: k, description: `${n} models`, default: k === s.aiProvider, emoji: ok ? '🟢' : '🔴' };
    });
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 AI Provider').addOptions(opts));
}

function createAIModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;

    const chatModels = p.models.filter(m => !['guard', 'stt'].includes(m.category));
    const opts = chatModels.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25),
        description: m.version.slice(0, 50),
        value: m.id,
        default: m.id === s.aiModel
    }));

    if (opts.length === 0) return null;
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_model').setPlaceholder('🤖 Model').addOptions(opts));
}

function createTTSProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(TTS_PROVIDERS).map(([k, p]) => ({
        label: p.name, value: k, description: `${p.voices.length} voices`,
        default: k === s.ttsProvider, emoji: (!p.requiresKey || process.env[p.keyEnv]) ? '🟢' : '🔴'
    }));
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_tts').setPlaceholder('🔊 TTS').addOptions(opts));
}

function createTTSVoiceMenu(guildId) {
    const s = getSettings(guildId);
    const p = TTS_PROVIDERS[s.ttsProvider];
    if (!p) return null;
    const opts = p.voices.slice(0, 25).map(v => ({ label: v.name, description: v.lang, value: v.id, default: v.id === s.ttsVoice }));
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_voice').setPlaceholder('🎤 Voice').addOptions(opts));
}

function createModeButtons(guildId) {
    const s = getSettings(guildId);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mode_text').setLabel('📝').setStyle(s.mode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mode_voice').setLabel('🔊').setStyle(s.mode === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tts_toggle').setLabel(`🎵${s.ttsOutput || 'auto'}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('search_toggle').setLabel(s.searchEnabled ? '🔍On' : '🔍Off').setStyle(s.searchEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary)
    );
}

// ==================== HANDLERS ====================

async function handleAIMessage(msg, query) {
    const guildId = msg.guild.id;
    const oderId = msg.author.id;
    const s = getSettings(guildId);

    const isVoiceMode = s.mode === 'voice';
    let inVoiceChannel = false;
    const ttsOutput = s.ttsOutput || 'auto';

    if (isVoiceMode && msg.member?.voice?.channel && ttsOutput !== 'file') {
        const result = await joinUserVoiceChannel(msg.member, msg.guild);
        if (result.success) inVoiceChannel = true;
    }

    await msg.channel.sendTyping();

    try {
        const response = await callAI(guildId, oderId, query, isVoiceMode);

        const searchIcon = response.searched ? ' 🔍' : '';
        const modelInfo = `*${response.model} • ${response.latency}ms${searchIcon}*`;
        const fullResponse = `${response.text}\n\n-# ${modelInfo}`;

        const parts = splitMessage(fullResponse);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) await msg.reply(parts[i]);
            else await msg.channel.send(parts[i]);
        }

        if (isVoiceMode) {
            try {
                const ttsResult = await generateTTS(guildId, response.text);
                if (ttsResult) {
                    if (ttsOutput === 'auto') {
                        if (inVoiceChannel) await playTTSInVoice(guildId, ttsResult);
                        else await sendTTSAsFile(msg.channel, ttsResult);
                    } else if (ttsOutput === 'voice' && inVoiceChannel) {
                        await playTTSInVoice(guildId, ttsResult);
                    } else {
                        await sendTTSAsFile(msg.channel, ttsResult);
                    }
                }
            } catch (e) {
                console.error('TTS error:', e.message);
            }
        }

    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

async function showSettings(msg) {
    if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
    const comps = [createAIProviderMenu(msg.guild.id), createAIModelMenu(msg.guild.id), createTTSProviderMenu(msg.guild.id), createTTSVoiceMenu(msg.guild.id), createModeButtons(msg.guild.id)].filter(Boolean);
    await msg.reply({ embeds: [createSettingsEmbed(msg.guild.id)], components: comps });
}

async function showHelp(msg) {
    const searchOk = CONFIG.tavilyApiKey || CONFIG.serperApiKey ? '✅' : '❌';
    const geminiOk = CONFIG.geminiApiKey ? '✅' : '❌';

    const helpText = `**🤖 Aria AI Bot v2.11**

**Chat:**
• \`.ai <pertanyaan>\` - Tanya AI
• \`@Aria <pertanyaan>\` - Mention

**Voice:**
• \`.join\` - Gabung voice
• \`.leave\` - Keluar voice
• \`.speak <teks>\` - TTS manual
• \`.stop\` - Stop audio

**Search:** ${searchOk}
• Otomatis search untuk info terkini
• \`.search <query>\` - Manual search

**Features:**
• Gemini AI: ${geminiOk}
• Memory: Unlimited
• TTS: Natural voice

**Commands:**
• \`.memory\` / \`.clear\`
• \`.status\` / \`.settings\``;

    await msg.reply(helpText);
}

async function handleSearch(msg, query) {
    if (!query) return msg.reply('❓ `.search berita hari ini`');
    if (!CONFIG.tavilyApiKey && !CONFIG.serperApiKey) return msg.reply('❌ No search API configured');

    await msg.channel.sendTyping();

    try {
        const result = await performSearch(query);
        if (!result) return msg.reply('❌ No results found');

        const display = formatSearchForDisplay(result, query);
        const parts = splitMessage(display);
        for (const part of parts) await msg.channel.send(part);

    } catch (e) {
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('❓ `.speak Halo dunia`');

    const statusMsg = await msg.reply('🔊 Generating...');

    try {
        const ttsResult = await generateTTS(msg.guild.id, text);
        if (!ttsResult) return statusMsg.edit('❌ TTS failed');

        const player = audioPlayers.get(msg.guild.id);
        if (player && msg.member?.voice?.channel) {
            await playTTSInVoice(msg.guild.id, ttsResult);
            await statusMsg.edit('🔊 Playing...');
        } else {
            await sendTTSAsFile(msg.channel, ttsResult);
            await statusMsg.delete().catch(() => {});
        }
    } catch (e) {
        await statusMsg.edit(`❌ ${e.message}`);
    }
}

async function handleStop(msg) {
    const player = audioPlayers.get(msg.guild.id);
    const queueData = ttsQueues.get(msg.guild.id);

    if (!player) return msg.reply('❌ Nothing playing');

    if (queueData) {
        if (queueData.currentFile) cleanupFile(queueData.currentFile);
        queueData.queue.forEach(item => cleanupFile(item.file));
        queueData.queue = [];
        queueData.playing = false;
        queueData.currentFile = null;
    }

    player.stop();
    await msg.reply('⏹️ Stopped');
}

// ==================== INTERACTIONS ====================

client.on('interactionCreate', async (int) => {
    if (!int.isStringSelectMenu() && !int.isButton()) return;
    if (!isAdmin(int.user.id)) return int.reply({ content: '❌ Admin only', ephemeral: true });

    const guildId = int.guild.id;

    try {
        if (int.customId === 'sel_ai') {
            const p = AI_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid', ephemeral: true });
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: `❌ ${p.keyEnv} missing`, ephemeral: true });
            updateSettings(guildId, 'aiProvider', int.values[0]);
            const chatModels = p.models.filter(m => !['guard', 'stt'].includes(m.category));
            if (chatModels.length > 0) updateSettings(guildId, 'aiModel', chatModels[0].id);
        } else if (int.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', int.values[0]);
        } else if (int.customId === 'sel_tts') {
            const p = TTS_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid', ephemeral: true });
            updateSettings(guildId, 'ttsProvider', int.values[0]);
            updateSettings(guildId, 'ttsVoice', p.voices[0].id);
        } else if (int.customId === 'sel_voice') {
            updateSettings(guildId, 'ttsVoice', int.values[0]);
        } else if (int.customId === 'mode_text') {
            updateSettings(guildId, 'mode', 'text');
        } else if (int.customId === 'mode_voice') {
            updateSettings(guildId, 'mode', 'voice');
        } else if (int.customId === 'tts_toggle') {
            const s = getSettings(guildId);
            const order = ['auto', 'file', 'voice'];
            const idx = order.indexOf(s.ttsOutput || 'auto');
            updateSettings(guildId, 'ttsOutput', order[(idx + 1) % 3]);
        } else if (int.customId === 'search_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'searchEnabled', !s.searchEnabled);
        }

        const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await int.update({ embeds: [createSettingsEmbed(guildId)], components: comps });

    } catch (e) {
        int.reply({ content: `❌ ${e.message}`, ephemeral: true }).catch(() => {});
    }
});

// ==================== MESSAGES ====================

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    const isMentioned = msg.mentions.has(client.user);
    let content = msg.content;

    if (isMentioned) {
        content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    }

    if (isMentioned && content) return handleAIMessage(msg, content);
    if (!content.startsWith(CONFIG.prefix)) return;

    const args = content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    try {
        switch (cmd) {
            case 'ai': case 'ask': case 'chat': case 'tanya':
                if (!args.join(' ')) return msg.reply('❓ `.ai pertanyaan`');
                await handleAIMessage(msg, args.join(' '));
                break;

            case 'search': case 'cari':
                await handleSearch(msg, args.join(' '));
                break;

            case 'speak': case 'say': case 'tts':
                await handleSpeak(msg, args.join(' '));
                break;

            case 'stop': case 'skip':
                await handleStop(msg);
                break;

            case 'join': case 'j':
                const jr = await joinUserVoiceChannel(msg.member, msg.guild);
                await msg.reply(jr.success ? (jr.alreadyConnected ? `✅ Di **${jr.channel.name}**` : `🔊 Joined **${jr.channel.name}**`) : `❌ ${jr.error}`);
                break;

            case 'leave': case 'dc':
                await msg.reply(await leaveVoiceChannel(msg.guild) ? '👋 Left' : '❌ Not in voice');
                break;

            case 'settings': case 'config':
                await showSettings(msg);
                break;

            case 'status':
                let text = '**📊 Status**\n\n';
                text += `**Search:** ${CONFIG.serperApiKey ? '🟢 Serper' : '🔴'} ${CONFIG.tavilyApiKey ? '🟢 Tavily' : '🔴'}\n`;
                text += `**Gemini:** ${CONFIG.geminiApiKey ? '🟢' : '🔴'}\n`;
                text += `**Convos:** ${conversations.size}\n`;
                text += `**Voice:** ${voiceConnections.size}`;
                await msg.reply(text);
                break;

            case 'memory': case 'mem':
                const info = getConversationInfo(msg.guild.id, msg.author.id);
                if (!info) return msg.reply('📭 No conversation');
                await msg.reply(`**🧠 Memory**\n📝 ${info.messageCount} msgs\n⏱️ ${info.ageMinutes} min\n♾️ Unlimited`);
                break;

            case 'clear': case 'reset':
                clearConversation(msg.guild.id, msg.author.id);
                await msg.reply('🗑️ Cleared!');
                break;

            case 'clearall':
                if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
                conversations.clear();
                await msg.reply('🗑️ All cleared');
                break;

            case 'help': case 'h':
                await showHelp(msg);
                break;

            case 'ping':
                await msg.reply(`🏓 ${Date.now() - msg.createdTimestamp}ms`);
                break;
        }
    } catch (e) {
        msg.reply(`❌ ${e.message}`).catch(() => {});
    }
});

// ==================== READY ====================

client.once('ready', () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🤖 ${client.user.tag} online!`);
    console.log(`📡 ${client.guilds.cache.size} servers`);
    console.log(`📦 v2.11.0 - Natural Search`);
    console.log('='.repeat(50));
    console.log(`🔍 Serper: ${CONFIG.serperApiKey ? '✅' : '❌'}`);
    console.log(`🔍 Tavily: ${CONFIG.tavilyApiKey ? '✅' : '❌'}`);
    console.log(`🧠 Gemini: ${CONFIG.geminiApiKey ? '✅' : '❌'}`);
    console.log('='.repeat(50) + '\n');

    client.user.setActivity(`.ai | .help`, { type: ActivityType.Listening });
    loadSettings();
    ensureTempDir();
});

// ==================== ERROR HANDLING ====================

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('SIGTERM', () => {
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
