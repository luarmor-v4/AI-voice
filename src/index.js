// ============================================================
//         DISCORD AI BOT - MULTI PROVIDER v2.10
//         Tavily Search | All Models | Long TTS | Unlimited Memory
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
const { exec, execSync } = require('child_process');
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
        version: '2.10.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        guilds: client?.guilds?.cache?.size || 0,
        conversations: conversations?.size || 0,
        activeVoice: voiceConnections?.size || 0,
        features: ['tavily-search', 'unlimited-memory', 'long-tts', 'multi-provider']
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
    ttsMaxChunkLength: 1000,
    ttsMaxTotalLength: 10000,
    ttsMinChunkLength: 50,
    ttsConcatTimeout: 120000,
    ttsGenerateTimeout: 60000,
    voiceInactivityTimeout: 300000
};

// ==================== TAVILY SEARCH ====================
const SEARCH_TRIGGERS = [
    'berita', 'news', 'kabar', 'terbaru', 'hari ini', 'sekarang',
    'latest', 'current', 'today', 'recent', 'update',
    'siapa presiden', 'siapa menteri', 'harga', 'kurs', 'cuaca',
    'jadwal', 'skor', 'hasil', 'pertandingan', 'match',
    'trending', 'viral', 'populer', 'terkini', 'breaking',
    'what is happening', 'what happened', 'who won', 'who is',
    '2024', '2025', '2026'
];

async function searchTavily(query, options = {}) {
    if (!CONFIG.tavilyApiKey) {
        console.log('Tavily API key not configured');
        return null;
    }

    const searchParams = {
        api_key: CONFIG.tavilyApiKey,
        query: query,
        search_depth: options.depth || 'basic',
        include_answer: true,
        include_raw_content: false,
        max_results: options.maxResults || 5,
        include_domains: options.includeDomains || [],
        exclude_domains: options.excludeDomains || []
    };

    return new Promise((resolve, reject) => {
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
                        const result = JSON.parse(data);
                        resolve(result);
                    } else {
                        console.error('Tavily error:', res.statusCode, data);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Tavily parse error:', e.message);
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => {
            console.error('Tavily request error:', e.message);
            resolve(null);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        req.write(postData);
        req.end();
    });
}

function shouldSearch(message) {
    const lower = message.toLowerCase();
    return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

function formatSearchResults(searchResult) {
    if (!searchResult) return '';

    let formatted = '\n\n📡 **INFORMASI REAL-TIME DARI INTERNET:**\n';

    if (searchResult.answer) {
        formatted += `\n**Ringkasan:** ${searchResult.answer}\n`;
    }

    if (searchResult.results && searchResult.results.length > 0) {
        formatted += '\n**Sumber:**\n';
        searchResult.results.slice(0, 3).forEach((result, i) => {
            formatted += `${i + 1}. **${result.title}**\n`;
            formatted += `   ${result.content?.slice(0, 200) || ''}...\n`;
            formatted += `   🔗 ${result.url}\n\n`;
        });
    }

    return formatted;
}

// ==================== SYSTEM PROMPT ====================
const MASTER_SYSTEM_PROMPT = `Kamu adalah Aria, asisten AI yang cerdas dan menyenangkan.

## KEPRIBADIAN INTI:
- **Bijaksana & Berpengetahuan**: Kamu memiliki pengetahuan luas tentang berbagai topik.
- **Jujur & Transparan**: JANGAN pernah mengarang fakta. Jika tidak tahu, katakan dengan jujur.
- **Profesional tapi Friendly**: Bisa serius saat diperlukan, tapi juga santai.
- **Empati & Helpful**: Pahami konteks dan kebutuhan user.

## GAYA KOMUNIKASI:
- Gunakan bahasa Indonesia yang natural
- Jawaban lengkap (3-6 kalimat untuk pertanyaan umum)
- Boleh pakai sedikit emoji
- Untuk coding: berikan kode yang clean dengan penjelasan

## KEMAMPUAN KHUSUS:
- Kamu memiliki akses ke internet melalui Tavily Search
- Jika ada informasi real-time yang diberikan, gunakan itu sebagai referensi utama
- Selalu sebutkan bahwa informasi berasal dari pencarian internet jika menggunakan hasil search

## ATURAN:
1. JANGAN mengarang informasi
2. Akui keterbatasan dengan jujur
3. Ingat konteks percakapan sebelumnya
4. Untuk voice mode: jawab lebih ringkas (2-4 kalimat)`;

// ==================== AI PROVIDERS - COMPLETE LIST ====================
const AI_PROVIDERS = {
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
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', version: '120B', category: 'production' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', version: '20B', category: 'production' },
            { id: 'groq/compound', name: 'Groq Compound', version: 'v1-system', category: 'system' },
            { id: 'groq/compound-mini', name: 'Groq Compound Mini', version: 'mini-system', category: 'system' },
            { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', version: '32B', category: 'preview' },
            { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', version: '17B-128E', category: 'preview' },
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', version: '17B-16E', category: 'preview' },
            { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', version: '0905', category: 'preview' },
            { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT OSS Safeguard', version: '20B-safe', category: 'preview' },
            { id: 'mistral-saba-24b', name: 'Mistral Saba 24B', version: '24B', category: 'production' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', version: '9B', category: 'production' },
            { id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4', version: '12B', category: 'guard' },
            { id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Prompt Guard 2', version: '22M', category: 'guard' },
            { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Prompt Guard 2 Large', version: '86M', category: 'guard' },
            { id: 'whisper-large-v3', name: 'Whisper Large V3', version: 'v3', category: 'stt' },
            { id: 'whisper-large-v3-turbo', name: 'Whisper V3 Turbo', version: 'v3-turbo', category: 'stt' },
            { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper EN', version: 'v3-en', category: 'stt' }
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
            { id: 'rtist', name: 'Rtist', version: 'v1' },
            { id: 'searchgpt', name: 'SearchGPT', version: 'v1' },
            { id: 'evil', name: 'Evil', version: 'v1' },
            { id: 'llamalight', name: 'Llama Light', version: 'Llama-3.3-70B' },
            { id: 'llamaguard', name: 'Llama Guard', version: 'Guard' },
            { id: 'pixtral', name: 'Pixtral', version: 'v1' },
            { id: 'hormoz', name: 'Hormoz', version: 'v1' },
            { id: 'hypnosis-tracy', name: 'Hypnosis Tracy', version: 'v1' },
            { id: 'sur', name: 'Sur', version: 'v1' },
            { id: 'sur-mistral', name: 'Sur Mistral', version: 'v1' },
            { id: 'llama-scaleway', name: 'Llama Scaleway', version: 'v1' }
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
            { id: 'deepseek', name: 'DeepSeek', version: 'V3' },
            { id: 'grok', name: 'Grok', version: 'v1' },
            { id: 'mistral', name: 'Mistral', version: 'Large' }
        ]
    },

    openrouter: {
        name: 'OpenRouter',
        requiresKey: true,
        keyEnv: 'OPENROUTER_API_KEY',
        models: [
            { id: 'aetherclood/trinity-large-preview:free', name: 'Trinity Large Preview', version: 'preview-free', category: 'jan2026' },
            { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3', version: 'v3-free', category: 'jan2026' },
            { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM 2.5 Thinking', version: '1.2B-think', category: 'jan2026' },
            { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 Instruct', version: '1.2B-inst', category: 'jan2026' },
            { id: 'black-forest-labs/flux-2-klein-4b', name: 'FLUX.2 Klein 4B', version: '4B', category: 'jan2026' },
            { id: 'allenai/molmo-2-8b:free', name: 'Molmo2 8B', version: '8B-free', category: 'jan2026' },
            { id: 'deepseek/deepseek-r1t-chimera:free', name: 'R1T Chimera', version: 'R1T-free', category: 'dec2025' },
            { id: 'black-forest-labs/flux-2-flex', name: 'FLUX.2 Flex', version: 'flex', category: 'dec2025' },
            { id: 'black-forest-labs/flux-2-pro', name: 'FLUX.2 Pro', version: 'pro', category: 'dec2025' },
            { id: 'nvidia/nemotron-nano-12b-2-vl:free', name: 'Nemotron Nano 12B 2 VL', version: '12B-VL', category: 'oct2025' },
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B V2', version: '9B-v2', category: 'sep2025' },
            { id: 'thudm/glm-4.5-air:free', name: 'GLM 4.5 Air', version: '4.5-air', category: 'sep2025' },
            { id: 'google/gemma-3n-2b:free', name: 'Gemma 3n 2B', version: '3n-2B', category: 'sep2025' },
            { id: 'deepseek/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', version: 'R1T2', category: 'sep2025' },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528', version: 'R1-0528', category: 'may2025' },
            { id: 'google/gemma-3n-4b:free', name: 'Gemma 3n 4B', version: '3n-4B', category: 'may2025' },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B', version: '24B-free', category: 'mar2025' },
            { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', version: '4B-free', category: 'mar2025' },
            { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', version: '12B-free', category: 'mar2025' },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', version: '27B-free', category: 'mar2025' },
            { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', version: '4B-free', category: 'qwen' },
            { id: 'qwen/qwen3-14b:free', name: 'Qwen3 14B', version: '14B-free', category: 'qwen' },
            { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', version: '32B-free', category: 'qwen' },
            { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B', version: '235B-free', category: 'qwen' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', version: '72B-free', category: 'qwen' },
            { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B', version: 'coder-32B', category: 'qwen' },
            { id: 'qwen/qwq-32b:free', name: 'QwQ 32B', version: 'QwQ-32B', category: 'qwen' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', version: 'R1-free', category: 'deepseek' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3', version: 'V3-free', category: 'deepseek' },
            { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek Chat', version: 'chat-free', category: 'deepseek' },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', version: '2.0-free', category: 'google' },
            { id: 'google/gemini-2.5-pro-exp-03-25:free', name: 'Gemini 2.5 Pro', version: '2.5-pro', category: 'google' },
            { id: 'google/gemini-2.5-flash-preview:free', name: 'Gemini 2.5 Flash', version: '2.5-flash', category: 'google' },
            { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', version: '9B-free', category: 'google' },
            { id: 'meta-llama/llama-3.2-1b-instruct:free', name: 'Llama 3.2 1B', version: '1B-free', category: 'meta' },
            { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', version: '3B-free', category: 'meta' },
            { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 11B Vision', version: '11B-vision', category: 'meta' },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', version: '8B-free', category: 'meta' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', version: '70B-free', category: 'meta' },
            { id: 'mistralai/mistral-nemo:free', name: 'Mistral Nemo', version: 'Nemo-free', category: 'mistral' },
            { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', version: '7B-free', category: 'mistral' },
            { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B', version: '24B-2501', category: 'mistral' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B', version: '70B-free', category: 'nvidia' },
            { id: 'thudm/glm-4-9b:free', name: 'GLM 4 9B', version: '9B-free', category: 'thudm' },
            { id: 'thudm/glm-z1-32b:free', name: 'GLM Z1 32B', version: '32B-free', category: 'thudm' },
            { id: 'thudm/glm-z1-9b:free', name: 'GLM Z1 9B', version: '9B-z1', category: 'thudm' },
            { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini', version: 'mini-free', category: 'microsoft' },
            { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium', version: 'medium-free', category: 'microsoft' },
            { id: 'microsoft/phi-4:free', name: 'Phi-4', version: 'phi4-free', category: 'microsoft' },
            { id: 'openchat/openchat-7b:free', name: 'OpenChat 7B', version: '7B-free', category: 'other' },
            { id: 'undi95/toppy-m-7b:free', name: 'Toppy M 7B', version: '7B-free', category: 'other' },
            { id: 'gryphe/mythomist-7b:free', name: 'MythoMist 7B', version: '7B-free', category: 'other' },
            { id: 'huggingfaceh4/zephyr-7b-beta:free', name: 'Zephyr 7B', version: '7B-beta', category: 'other' },
            { id: 'moonshotai/moonlight-16b-a3b-instruct:free', name: 'Moonlight 16B', version: '16B-free', category: 'other' },
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', version: '405B-free', category: 'other' },
            { id: 'sophosympatheia/rogue-rose-103b-v0.2:free', name: 'Rogue Rose 103B', version: '103B-free', category: 'other' }
        ]
    },

    huggingface: {
        name: 'HuggingFace',
        requiresKey: true,
        keyEnv: 'HUGGINGFACE_API_KEY',
        models: [
            { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', version: '3.1-8B' },
            { id: 'meta-llama/Llama-3.2-3B-Instruct', name: 'Llama 3.2 3B', version: '3.2-3B' },
            { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', version: '3.3-70B' },
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', version: '7B-v0.3' },
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', version: '8x7B' },
            { id: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini', version: 'mini-4k' },
            { id: 'microsoft/Phi-3.5-mini-instruct', name: 'Phi-3.5 Mini', version: '3.5-mini' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', version: '2.5-72B' },
            { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', version: 'coder-32B' },
            { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', version: '2-9B' },
            { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', version: '2-27B' },
            { id: 'bigcode/starcoder2-15b', name: 'StarCoder2 15B', version: '15B' },
            { id: 'codellama/CodeLlama-34b-Instruct-hf', name: 'CodeLlama 34B', version: '34B' }
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
            { id: 'en-US-ChristopherNeural', name: 'Christopher (EN Male)', lang: 'en' },
            { id: 'en-US-EricNeural', name: 'Eric (EN Male)', lang: 'en' },
            { id: 'en-US-MichelleNeural', name: 'Michelle (EN Female)', lang: 'en' },
            { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', lang: 'en' },
            { id: 'en-GB-RyanNeural', name: 'Ryan (UK Male)', lang: 'en' },
            { id: 'en-AU-NatashaNeural', name: 'Natasha (AU Female)', lang: 'en' },
            { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP Female)', lang: 'ja' },
            { id: 'ja-JP-KeitaNeural', name: 'Keita (JP Male)', lang: 'ja' },
            { id: 'ko-KR-SunHiNeural', name: 'SunHi (KR Female)', lang: 'ko' },
            { id: 'ko-KR-InJoonNeural', name: 'InJoon (KR Male)', lang: 'ko' },
            { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN Female)', lang: 'zh' },
            { id: 'zh-CN-YunxiNeural', name: 'Yunxi (CN Male)', lang: 'zh' },
            { id: 'zh-TW-HsiaoChenNeural', name: 'HsiaoChen (TW Female)', lang: 'zh' },
            { id: 'de-DE-KatjaNeural', name: 'Katja (DE Female)', lang: 'de' },
            { id: 'fr-FR-DeniseNeural', name: 'Denise (FR Female)', lang: 'fr' },
            { id: 'es-ES-ElviraNeural', name: 'Elvira (ES Female)', lang: 'es' },
            { id: 'pt-BR-FranciscaNeural', name: 'Francisca (BR Female)', lang: 'pt' },
            { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana (RU Female)', lang: 'ru' },
            { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (AR Female)', lang: 'ar' },
            { id: 'hi-IN-SwaraNeural', name: 'Swara (IN Female)', lang: 'hi' }
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
            { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', lang: 'multi' },
            { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', lang: 'multi' },
            { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', lang: 'multi' }
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
function getConversation(guildId, userId) {
    const key = `${guildId}-${userId}`;
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

function addToConversation(guildId, userId, role, content) {
    const conv = getConversation(guildId, userId);
    conv.messages.push({ role, content, timestamp: Date.now() });
    return conv;
}

function clearConversation(guildId, userId) {
    conversations.delete(`${guildId}-${userId}`);
}

function getConversationInfo(guildId, userId) {
    const key = `${guildId}-${userId}`;
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
    try {
        if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch (e) {}
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

function removeEmojisAndFormatForTTS(text) {
    return text
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
        .replace(/```[\w]*\n?([\s\S]*?)```/g, (m, code) => ` (kode ${code.trim().split('\n').length} baris) `)
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTextForTTS(text, maxLength = CONFIG.ttsMaxChunkLength) {
    const clean = removeEmojisAndFormatForTTS(text);
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
            const lastSemicolon = searchArea.lastIndexOf('; ');
            splitIndex = Math.max(lastComma, lastSemicolon);
            if (splitIndex > 0 && splitIndex > maxLength / 3) splitIndex += 1;
            else splitIndex = -1;
        }
        if (splitIndex === -1) {
            splitIndex = searchArea.lastIndexOf(' ');
            if (splitIndex < maxLength / 4) splitIndex = -1;
        }
        if (splitIndex === -1 || splitIndex < CONFIG.ttsMinChunkLength) splitIndex = maxLength;
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
            console.log(`📂 Loaded ${guildSettings.size} guild settings`);
        }
    } catch (e) { console.error('Load settings error:', e.message); }
}

function saveSettings() {
    try {
        const dir = path.dirname(CONFIG.dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = {};
        guildSettings.forEach((s, id) => data[id] = s);
        fs.writeFileSync(CONFIG.dataPath, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Save settings error:', e.message); }
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

function isAdmin(userId) {
    return CONFIG.adminIds.includes(userId);
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
        let splitIndex = remaining.lastIndexOf('\n', maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) splitIndex = remaining.lastIndexOf('. ', maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) splitIndex = remaining.lastIndexOf(' ', maxLength);
        if (splitIndex === -1) splitIndex = maxLength;
        parts.push(remaining.slice(0, splitIndex + 1));
        remaining = remaining.slice(splitIndex + 1);
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
async function callAI(guildId, userId, userMessage, isVoiceMode = false) {
    const s = getSettings(guildId);
    const { aiProvider, aiModel, systemPrompt, searchEnabled } = s;
    const start = Date.now();
    const conv = getConversation(guildId, userId);
    const history = conv.messages;
    let searchContext = '';
    if (searchEnabled && CONFIG.tavilyApiKey && shouldSearch(userMessage)) {
        console.log('🔍 Searching with Tavily:', userMessage.slice(0, 50));
        const searchResult = await searchTavily(userMessage);
        if (searchResult) {
            searchContext = formatSearchResults(searchResult);
            console.log('✅ Search completed, found', searchResult.results?.length || 0, 'results');
        }
    }
    let finalSystemPrompt = systemPrompt;
    if (searchContext) {
        finalSystemPrompt += `\n\n[KONTEKS DARI PENCARIAN INTERNET]${searchContext}\n\nGunakan informasi di atas untuk menjawab pertanyaan user. Sebutkan bahwa informasi ini dari pencarian internet.`;
    }
    if (isVoiceMode) {
        finalSystemPrompt += '\n\n[MODE: Voice - Jawab ringkas 2-4 kalimat]';
    }
    try {
        let response;
        switch (aiProvider) {
            case 'groq': response = await callGroq(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'pollinations_free': response = await callPollinationsFree(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'pollinations_api': response = await callPollinationsAPI(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'openrouter': response = await callOpenRouter(aiModel, userMessage, history, finalSystemPrompt); break;
            case 'huggingface': response = await callHuggingFace(aiModel, userMessage, history, finalSystemPrompt); break;
            default: response = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
        }
        addToConversation(guildId, userId, 'user', userMessage);
        addToConversation(guildId, userId, 'assistant', response);
        const info = getModelInfo(aiProvider, aiModel);
        return {
            text: response,
            provider: AI_PROVIDERS[aiProvider]?.name || aiProvider,
            model: info.name,
            version: info.version,
            latency: Date.now() - start,
            searched: !!searchContext
        };
    } catch (error) {
        console.error(`AI Error (${aiProvider}):`, error.message);
        if (aiProvider !== 'pollinations_free') {
            console.log('Fallback to Pollinations Free...');
            const fallback = await callPollinationsFree('openai', userMessage, history, finalSystemPrompt);
            addToConversation(guildId, userId, 'user', userMessage);
            addToConversation(guildId, userId, 'assistant', fallback);
            return {
                text: fallback,
                provider: 'Pollinations (Fallback)',
                model: 'OpenAI GPT',
                version: 'GPT-4.1-nano',
                latency: Date.now() - start,
                searched: !!searchContext
            };
        }
        throw error;
    }
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
    if (result.error) throw new Error(result.error.message);
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

async function callPollinationsAPI(model, message, history, systemPrompt) {
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) throw new Error('POLLINATIONS_API_KEY not set');
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-50).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
    ];
    const { data, statusCode } = await httpRequest({
        hostname: 'gen.pollinations.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7, stream: false }));
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
    return result.choices[0].message.content;
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
    }, JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7, stream: false }));
    if (statusCode === 401) throw new Error('Invalid API key');
    if (statusCode === 402) throw new Error('Insufficient credits');
    if (statusCode === 429) throw new Error('Rate limited');
    if (statusCode !== 200) {
        try {
            const result = JSON.parse(data);
            throw new Error(result.error?.message || `HTTP ${statusCode}`);
        } catch { throw new Error(`HTTP ${statusCode}`); }
    }
    const result = JSON.parse(data);
    if (result.error) throw new Error(result.error.message);
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
                    file.on('error', reject);
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
        if (inputFiles.length === 0) return reject(new Error('No input files'));
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
            if (err) {
                exec(`ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" -y`, { timeout: CONFIG.ttsConcatTimeout }, (err2) => {
                    if (err2) reject(err);
                    else resolve(outputPath);
                });
            } else resolve(outputPath);
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
    console.log(`🔊 TTS: ${chunks.length} chunks (${text.length} chars)`);
    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = path.join(CONFIG.tempPath, `tts_${sessionId}_chunk${i}.mp3`);
            if (progressCallback) progressCallback(i + 1, chunks.length);
            try {
                await generateSingleTTSChunk(chunks[i], s.ttsVoice, s.ttsProvider, chunkPath);
                if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) chunkFiles.push(chunkPath);
            } catch (chunkError) {
                console.error(`TTS chunk ${i} error:`, chunkError.message);
                if (s.ttsProvider !== 'edge') {
                    try {
                        await generateSingleTTSChunk(chunks[i], 'id-ID-GadisNeural', 'edge', chunkPath);
                        if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) chunkFiles.push(chunkPath);
                    } catch (e) {}
                }
            }
        }
        if (chunkFiles.length === 0) throw new Error('No TTS chunks generated');
        console.log(`🔊 TTS: ${chunkFiles.length}/${chunks.length} chunks OK`);
        if (chunkFiles.length === 1) return { type: 'single', file: chunkFiles[0], sessionId };
        const combinedPath = path.join(CONFIG.tempPath, `tts_${sessionId}_combined.mp3`);
        try {
            await concatenateAudioFiles(chunkFiles, combinedPath);
            cleanupFiles(chunkFiles);
            return { type: 'combined', file: combinedPath, sessionId, chunkCount: chunks.length };
        } catch (concatError) {
            console.log('FFmpeg concat failed, using chunks:', concatError.message);
            return { type: 'chunks', files: chunkFiles, sessionId, chunkCount: chunks.length };
        }
    } catch (error) {
        console.error('TTS error:', error.message);
        cleanupSessionFiles(sessionId);
        throw error;
    }
}

// ==================== VOICE FUNCTIONS ====================
function resetVoiceTimeout(guildId) {
    if (voiceTimeouts.has(guildId)) clearTimeout(voiceTimeouts.get(guildId));
    const timeout = setTimeout(() => {
        const conn = voiceConnections.get(guildId);
        if (conn) { console.log(`Voice timeout: ${guildId}`); leaveVoiceChannel({ id: guildId }); }
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
            if (voiceTimeouts.has(guild.id)) clearTimeout(voiceTimeouts.get(guild.id));
        }
        const conn = joinVoiceChannel({
            channelId: vc.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        await entersState(conn, VoiceConnectionStatus.Ready, 30000);
        const player = createAudioPlayer();
        conn.subscribe(player);
        voiceConnections.set(guild.id, conn);
        audioPlayers.set(guild.id, player);
        ttsQueues.set(guild.id, { queue: [], playing: false, currentFile: null });
        player.on(AudioPlayerStatus.Idle, () => processNextInQueue(guild.id));
        player.on('error', (error) => {
            console.error('Audio error:', error.message);
            const queueData = ttsQueues.get(guild.id);
            if (queueData?.currentFile) { cleanupFile(queueData.currentFile); queueData.currentFile = null; }
            processNextInQueue(guild.id);
        });
        resetVoiceTimeout(guild.id);
        return { success: true, channel: vc };
    } catch (e) {
        console.error('Voice join error:', e);
        return { success: false, error: e.message };
    }
}

async function leaveVoiceChannel(guild) {
    const guildId = guild.id || guild;
    const conn = voiceConnections.get(guildId) || getVoiceConnection(guildId);
    if (voiceTimeouts.has(guildId)) { clearTimeout(voiceTimeouts.get(guildId)); voiceTimeouts.delete(guildId); }
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
    if (queueData.currentFile) { cleanupFile(queueData.currentFile); queueData.currentFile = null; }
    if (queueData.queue.length === 0) { queueData.playing = false; resetVoiceTimeout(guildId); return; }
    const player = audioPlayers.get(guildId);
    if (!player) { queueData.queue.forEach(item => cleanupFile(item.file)); queueData.queue = []; queueData.playing = false; return; }
    const next = queueData.queue.shift();
    queueData.currentFile = next.file;
    queueData.playing = true;
    try {
        const resource = createAudioResource(next.file, { inputType: StreamType.Arbitrary, inlineVolume: true });
        resource.volume?.setVolume(1);
        player.play(resource);
        resetVoiceTimeout(guildId);
    } catch (e) {
        console.error('Play error:', e.message);
        cleanupFile(next.file);
        processNextInQueue(guildId);
    }
}

function addToTTSQueue(guildId, ttsResult) {
    let queueData = ttsQueues.get(guildId);
    if (!queueData) { queueData = { queue: [], playing: false, currentFile: null }; ttsQueues.set(guildId, queueData); }
    if (ttsResult.type === 'single' || ttsResult.type === 'combined') queueData.queue.push({ file: ttsResult.file });
    else if (ttsResult.type === 'chunks') ttsResult.files.forEach(file => queueData.queue.push({ file }));
    if (!queueData.playing) processNextInQueue(guildId);
    return queueData.queue.length;
}

async function playTTSInVoice(guildId, ttsResult) {
    const player = audioPlayers.get(guildId);
    if (!player) return false;
    try { addToTTSQueue(guildId, ttsResult); return true; }
    catch (e) { console.error('TTS playback error:', e.message); return false; }
}

async function sendTTSAsFile(channel, ttsResult) {
    try {
        let filePath;
        let cleanup = [];
        if (ttsResult.type === 'single' || ttsResult.type === 'combined') filePath = ttsResult.file;
        else if (ttsResult.type === 'chunks') {
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
    } catch (e) { console.error('TTS file error:', e.message); return false; }
}

// ==================== EMBEDS & MENUS ====================
function createSettingsEmbed(guildId) {
    const s = getSettings(guildId);
    const ai = AI_PROVIDERS[s.aiProvider];
    const tts = TTS_PROVIDERS[s.ttsProvider];
    const m = getModelInfo(s.aiProvider, s.aiModel);
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);
    const searchStatus = CONFIG.tavilyApiKey ? (s.searchEnabled ? '🟢 On' : '🔴 Off') : '⚫ No Key';
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Aria Settings')
        .setDescription(`**${totalModels}** models • Memory: **Unlimited** • Search: ${searchStatus}`)
        .addFields(
            { name: '🧠 AI', value: `**${ai?.name}**\n${m.name}`, inline: true },
            { name: '🔊 TTS', value: `**${tts?.name}**\n${s.ttsVoice.split('-').slice(-1)[0]}`, inline: true },
            { name: '📝 Mode', value: s.mode === 'voice' ? '🔊 Voice' : '📝 Text', inline: true },
            { name: '🔍 Search', value: searchStatus, inline: true }
        )
        .setFooter({ text: `TTS max ${CONFIG.ttsMaxTotalLength} chars` })
        .setTimestamp();
}

function createAIProviderMenu(guildId) {
    const s = getSettings(guildId);
    const opts = Object.entries(AI_PROVIDERS).map(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category)).length;
        return { label: p.name.slice(0, 25), value: k, description: `${chatModels} models`, default: k === s.aiProvider, emoji: ok ? '🟢' : '🔴' };
    });
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_ai').setPlaceholder('🧠 AI Provider').addOptions(opts));
}

function createAIModelMenu(guildId) {
    const s = getSettings(guildId);
    const p = AI_PROVIDERS[s.aiProvider];
    if (!p) return null;
    const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category));
    const opts = chatModels.slice(0, 25).map(m => ({
        label: m.name.slice(0, 25),
        description: `${m.version}${m.category ? ` • ${m.category}` : ''}`.slice(0, 50),
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

// ==================== MAIN AI HANDLER ====================
async function handleAIMessage(msg, query) {
    const guildId = msg.guild.id;
    const userId = msg.author.id;
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
        const response = await callAI(guildId, userId, query, isVoiceMode);
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
                const cleanText = removeEmojisAndFormatForTTS(response.text);
                let statusMsg = null;
                if (cleanText.length > CONFIG.ttsMaxChunkLength) {
                    statusMsg = await msg.channel.send(`🔊 Generating audio...`);
                }
                const ttsResult = await generateTTS(guildId, response.text, (current, total) => {
                    if (statusMsg && total > 1) statusMsg.edit(`🔊 Part ${current}/${total}...`).catch(() => {});
                });
                if (statusMsg) statusMsg.delete().catch(() => {});
                if (ttsResult) {
                    if (ttsOutput === 'auto') {
                        if (inVoiceChannel) await playTTSInVoice(guildId, ttsResult);
                        else await sendTTSAsFile(msg.channel, ttsResult);
                    } else if (ttsOutput === 'voice' && inVoiceChannel) await playTTSInVoice(guildId, ttsResult);
                    else if (ttsOutput === 'file') await sendTTSAsFile(msg.channel, ttsResult);
                    else await sendTTSAsFile(msg.channel, ttsResult);
                }
            } catch (ttsError) { console.error('TTS error:', ttsError.message); }
        }
    } catch (e) {
        console.error('AI Error:', e);
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

// ==================== COMMANDS ====================
async function showSettings(msg) {
    if (!isAdmin(msg.author.id)) return msg.reply('❌ Admin only');
    const guildId = msg.guild.id;
    const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
    await msg.reply({ embeds: [createSettingsEmbed(guildId)], components: comps });
}

async function showHelp(msg) {
    const searchStatus = CONFIG.tavilyApiKey ? '✅' : '❌';
    const helpText = `**🤖 Aria AI Bot v2.10**

**Chat:**
• \`.ai <pertanyaan>\` - Tanya AI
• \`@Aria <pertanyaan>\` - Mention

**Voice:**
• \`.join\` - Gabung voice
• \`.leave\` - Keluar voice
• \`.speak <teks>\` - TTS manual
• \`.stop\` - Stop audio

**Search:** ${searchStatus}
• Otomatis search untuk berita/info terkini
• Keywords: berita, terbaru, harga, dll

**Memory:**
• \`.memory\` - Status memori
• \`.clear\` - Hapus memori

**Lainnya:**
• \`.status\` - Provider info
• \`.search <query>\` - Manual search
• \`.settings\` - Settings (admin)`;
    await msg.reply(helpText);
}

async function showStatus(msg) {
    let text = '**📊 Status**\n\n**AI:**\n';
    Object.entries(AI_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        const n = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category)).length;
        text += `${ok ? '🟢' : '🔴'} ${p.name} (${n})\n`;
    });
    text += '\n**TTS:**\n';
    Object.entries(TTS_PROVIDERS).forEach(([k, p]) => {
        const ok = !p.requiresKey || process.env[p.keyEnv];
        text += `${ok ? '🟢' : '🔴'} ${p.name} (${p.voices.length})\n`;
    });
    text += `\n**Search:** ${CONFIG.tavilyApiKey ? '🟢 Tavily' : '🔴 No Key'}`;
    text += `\n**Stats:** ${conversations.size} convos, ${voiceConnections.size} voice`;
    await msg.reply(text);
}

async function handleSearch(msg, query) {
    if (!query) return msg.reply('❓ `.search berita hari ini`');
    if (!CONFIG.tavilyApiKey) return msg.reply('❌ Tavily API key not configured');
    await msg.channel.sendTyping();
    try {
        const result = await searchTavily(query, { maxResults: 5 });
        if (!result) return msg.reply('❌ Search failed');
        let response = `🔍 **Hasil pencarian:** "${query}"\n`;
        if (result.answer) response += `\n**Ringkasan:** ${result.answer}\n`;
        if (result.results?.length > 0) {
            response += '\n**Sumber:**\n';
            result.results.slice(0, 5).forEach((r, i) => {
                response += `${i + 1}. **${r.title}**\n${r.content?.slice(0, 150) || ''}...\n🔗 ${r.url}\n\n`;
            });
        }
        const parts = splitMessage(response);
        for (const part of parts) await msg.channel.send(part);
    } catch (e) {
        console.error('Search error:', e);
        await msg.reply(`❌ Error: ${e.message}`);
    }
}

async function handleSpeak(msg, text) {
    if (!text) return msg.reply('❓ `.speak Halo dunia`');
    const statusMsg = await msg.reply('🔊 Generating...');
    try {
        const ttsResult = await generateTTS(msg.guild.id, text, (c, t) => {
            if (t > 1) statusMsg.edit(`🔊 Part ${c}/${t}...`).catch(() => {});
        });
        if (!ttsResult) return statusMsg.edit('❌ TTS failed');
        const player = audioPlayers.get(msg.guild.id);
        if (player && msg.member?.voice?.channel) {
            await playTTSInVoice(msg.guild.id, ttsResult);
            await statusMsg.edit(`🔊 Playing (${ttsResult.chunkCount || 1} parts)`);
        } else {
            await sendTTSAsFile(msg.channel, ttsResult);
            await statusMsg.delete().catch(() => {});
        }
    } catch (e) { await statusMsg.edit(`❌ ${e.message}`); }
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
            const chatModels = p.models.filter(m => !['guard', 'tts', 'stt'].includes(m.category));
            if (chatModels.length > 0) updateSettings(guildId, 'aiModel', chatModels[0].id);
        } else if (int.customId === 'sel_model') {
            updateSettings(guildId, 'aiModel', int.values[0]);
        } else if (int.customId === 'sel_tts') {
            const p = TTS_PROVIDERS[int.values[0]];
            if (!p) return int.reply({ content: '❌ Invalid', ephemeral: true });
            if (p.requiresKey && !process.env[p.keyEnv]) return int.reply({ content: `❌ ${p.keyEnv} missing`, ephemeral: true });
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
            const current = order.indexOf(s.ttsOutput || 'auto');
            updateSettings(guildId, 'ttsOutput', order[(current + 1) % 3]);
        } else if (int.customId === 'search_toggle') {
            const s = getSettings(guildId);
            updateSettings(guildId, 'searchEnabled', !s.searchEnabled);
        }
        const comps = [createAIProviderMenu(guildId), createAIModelMenu(guildId), createTTSProviderMenu(guildId), createTTSVoiceMenu(guildId), createModeButtons(guildId)].filter(Boolean);
        await int.update({ embeds: [createSettingsEmbed(guildId)], components: comps });
    } catch (e) { int.reply({ content: `❌ ${e.message}`, ephemeral: true }).catch(() => {}); }
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const isMentioned = msg.mentions.has(client.user);
    let content = msg.content;
    if (isMentioned) content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
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
                await showStatus(msg);
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
                const count = conversations.size;
                conversations.clear();
                await msg.reply(`🗑️ Cleared ${count} convos`);
                break;
            case 'help': case 'h':
                await showHelp(msg);
                break;
            case 'ping':
                await msg.reply(`🏓 ${Date.now() - msg.createdTimestamp}ms | WS: ${client.ws.ping}ms`);
                break;
        }
    } catch (e) { msg.reply(`❌ ${e.message}`).catch(() => {}); }
});

// ==================== READY ====================
client.once('ready', () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🤖 ${client.user.tag} online!`);
    console.log(`📡 ${client.guilds.cache.size} servers`);
    console.log(`📦 v2.10.0 - Tavily Search`);
    console.log(`🔍 Search: ${CONFIG.tavilyApiKey ? 'Enabled' : 'Disabled'}`);
    console.log('='.repeat(50));
    const totalModels = Object.values(AI_PROVIDERS).reduce((acc, p) => acc + p.models.length, 0);
    console.log(`📊 ${totalModels} models available\n`);
    client.user.setActivity(`.ai | .help`, { type: ActivityType.Listening });
    loadSettings();
    ensureTempDir();
});

// ==================== ERROR HANDLING ====================
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('SIGTERM', () => { console.log('Shutdown...'); voiceConnections.forEach((c) => c.destroy()); client.destroy(); process.exit(0); });

// ==================== START ====================
if (!CONFIG.token) { console.error('❌ DISCORD_TOKEN not set!'); process.exit(1); }
client.login(CONFIG.token);
