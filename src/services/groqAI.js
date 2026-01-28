const Groq = require('groq-sdk');
const config = require('../utils/config');
const logger = require('../utils/logger');

const groq = new Groq({
    apiKey: config.groqApiKey
});

// System prompt untuk personality bot
const SYSTEM_PROMPT = `Kamu adalah ${config.botName}, asisten AI yang ramah dan cerdas berbahasa Indonesia.

Karakteristik kamu:
- Ramah, ceria, dan helpful
- Berbicara natural seperti teman
- Jawaban singkat dan jelas (maksimal 2-3 kalimat untuk voice chat)
- Bisa bercanda tapi tetap sopan
- Gunakan emoji sesekali untuk ekspresif 😊

PENTING: Karena respons akan diucapkan (voice), berikan jawaban yang:
- Ringkas dan mudah didengar
- Tidak mengandung formatting markdown yang rumit
- Tidak ada list panjang atau kode
- Natural untuk diucapkan`;

/**
 * Generate AI response using Groq
 * @param {string} userMessage - User's message
 * @param {Array} conversationHistory - Previous conversation
 * @returns {Promise<string>} AI response
 */
async function generateResponse(userMessage, conversationHistory = []) {
    try {
        // Build messages array
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory.slice(-10), // Keep last 10 messages
            { role: 'user', content: userMessage }
        ];

        logger.debug('Sending to Groq:', { userMessage, historyLength: conversationHistory.length });

        const completion = await groq.chat.completions.create({
            model: config.groqModel,
            messages: messages,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            top_p: 1,
            stream: false
        });

        const response = completion.choices[0]?.message?.content || 'Maaf, aku tidak bisa merespons.';
        
        logger.debug('Groq response:', response);
        
        return response;

    } catch (error) {
        logger.error('Groq AI Error:', error);
        
        // Handle specific errors
        if (error.status === 429) {
            return 'Maaf, aku sedang kelelahan. Coba lagi sebentar ya! 😅';
        }
        
        throw error;
    }
}

/**
 * Transcribe audio using Groq Whisper
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioPath) {
    try {
        const fs = require('fs');
        
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-large-v3',
            language: 'id', // Indonesian
            response_format: 'text'
        });

        logger.debug('Transcription:', transcription);
        
        return transcription;

    } catch (error) {
        logger.error('Transcription Error:', error);
        throw error;
    }
}

module.exports = {
    generateResponse,
    transcribeAudio
};
