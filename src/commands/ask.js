const { EmbedBuilder } = require('discord.js');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const { generateResponse } = require('../services/groqAI');
const { textToSpeech, cleanupFile } = require('../services/tts');
const config = require('../utils/config');
const logger = require('../utils/logger');

async function askCommand(client, message, args) {
    if (args.length === 0) {
        return message.reply(`❓ Mau tanya apa? Contoh: \`${config.prefix}ask Apa itu AI?\``);
    }
    
    const question = args.join(' ');
    const userId = message.author.id;
    const guildId = message.guild.id;
    
    await message.channel.sendTyping();
    
    try {
        // Get conversation history
        const historyKey = `${guildId}-${userId}`;
        const history = client.conversations.get(historyKey) || [];
        
        // Generate AI response
        logger.info(`Question from ${message.author.tag}: ${question}`);
        const aiResponse = await generateResponse(question, history);
        logger.info(`AI Response: ${aiResponse}`);
        
        // Update history
        history.push(
            { role: 'user', content: question },
            { role: 'assistant', content: aiResponse }
        );
        client.conversations.set(historyKey, history.slice(-10));
        
        // Create embed
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
        
        await message.reply({ embeds: [embed] });
        
        // Play voice if user in voice channel AND bot is connected
        const connection = client.voiceConnections.get(guildId);
        const voiceChannel = message.member?.voice.channel;
        
        if (connection && voiceChannel) {
            logger.info('Playing voice response...');
            await playVoiceResponse(client, guildId, aiResponse);
        } else if (voiceChannel && !connection) {
            logger.debug('User in voice but bot not connected. Use !join first.');
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
        logger.debug('Generating TTS...');
        audioPath = await textToSpeech(text);
        logger.debug(`TTS generated: ${audioPath}`);
        
        // Get connection
        const connection = client.voiceConnections.get(guildId);
        if (!connection) {
            logger.error('No voice connection found');
            cleanupFile(audioPath);
            return;
        }
        
        // Get or create audio player
        let player = client.audioPlayers.get(guildId);
        if (!player) {
            player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Play
                }
            });
            client.audioPlayers.set(guildId, player);
            connection.subscribe(player);
            logger.debug('Created new audio player');
        }
        
        // Create and play resource
        const resource = createAudioResource(audioPath, {
            inlineVolume: true
        });
        resource.volume?.setVolume(1);
        
        player.play(resource);
        logger.info('Playing audio...');
        
        // Cleanup after done
        player.once(AudioPlayerStatus.Idle, () => {
            logger.debug('Audio finished playing');
            cleanupFile(audioPath);
        });
        
        player.once('error', (error) => {
            logger.error('Audio player error:', error);
            cleanupFile(audioPath);
        });
        
    } catch (error) {
        logger.error('Voice response error:', error);
        if (audioPath) cleanupFile(audioPath);
    }
}

module.exports = { askCommand };
