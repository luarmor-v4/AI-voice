const { EmbedBuilder } = require('discord.js');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { generateResponse } = require('../services/groqAI');
const { textToSpeech } = require('../services/tts');
const { cleanupFile } = require('../utils/audioUtils');
const config = require('../utils/config');
const logger = require('../utils/logger');

async function askCommand(client, message, args) {
    // Check if there's a question
    if (args.length === 0) {
        return message.reply(`❓ Mau tanya apa? Contoh: \`${config.prefix}ask Apa itu AI?\``);
    }
    
    const question = args.join(' ');
    const userId = message.author.id;
    const guildId = message.guild.id;
    
    // Show typing indicator
    await message.channel.sendTyping();
    
    try {
        // Get conversation history
        const historyKey = `${guildId}-${userId}`;
        const history = client.conversations.get(historyKey) || [];
        
        // Generate AI response
        logger.info(`Question from ${message.author.tag}: ${question}`);
        const aiResponse = await generateResponse(question, history);
        
        // Update conversation history
        history.push(
            { role: 'user', content: question },
            { role: 'assistant', content: aiResponse }
        );
        client.conversations.set(historyKey, history.slice(-10)); // Keep last 10
        
        // Create response embed
        const embed = new EmbedBuilder()
            .setColor(0x00D166)
            .setAuthor({ 
                name: message.author.displayName, 
                iconURL: message.author.displayAvatarURL() 
            })
            .addFields(
                { name: '❓ Pertanyaan', value: question.slice(0, 1024), inline: false },
                { name: `🤖 ${config.botName}`, value: aiResponse.slice(0, 1024), inline: false }
            )
            .setFooter({ text: 'Powered by Groq AI' })
            .setTimestamp();
        
        // Send text response
        await message.reply({ embeds: [embed] });
        
        // If user is in voice channel, also play audio
        const voiceChannel = message.member?.voice.channel;
        const connection = client.voiceConnections.get(guildId);
        
        if (voiceChannel && connection) {
            await playVoiceResponse(client, guildId, aiResponse);
        }
        
    } catch (error) {
        logger.error('Ask command error:', error);
        await message.reply('❌ Maaf, terjadi error saat memproses pertanyaanmu.');
    }
}

async function playVoiceResponse(client, guildId, text) {
    let audioPath = null;
    
    try {
        // Generate speech
        audioPath = await textToSpeech(text);
        
        // Get or create audio player
        let player = client.audioPlayers.get(guildId);
        if (!player) {
            player = createAudioPlayer();
            client.audioPlayers.set(guildId, player);
            
            // Subscribe connection to player
            const connection = client.voiceConnections.get(guildId);
            if (connection) {
                connection.subscribe(player);
            }
        }
        
        // Create and play audio resource
        const resource = createAudioResource(audioPath);
        player.play(resource);
        
        // Cleanup after playing
        player.once(AudioPlayerStatus.Idle, () => {
            cleanupFile(audioPath);
        });
        
        logger.debug('Playing voice response');
        
    } catch (error) {
        logger.error('Error playing voice response:', error);
        if (audioPath) cleanupFile(audioPath);
    }
}

module.exports = { askCommand };
