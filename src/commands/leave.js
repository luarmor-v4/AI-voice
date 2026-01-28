const { getVoiceConnection } = require('@discordjs/voice');
const logger = require('../utils/logger');

async function leaveCommand(client, message, args) {
    const connection = getVoiceConnection(message.guild.id);
    
    if (!connection) {
        return message.reply('❌ Aku tidak sedang di voice channel!');
    }
    
    try {
        // Destroy connection
        connection.destroy();
        
        // Remove from store
        client.voiceConnections.delete(message.guild.id);
        client.audioPlayers.delete(message.guild.id);
        client.conversations.delete(message.guild.id);
        
        logger.info(`Left voice channel in ${message.guild.name}`);
        
        await message.reply('👋 Bye bye! Sampai jumpa lagi!');
        
    } catch (error) {
        logger.error('Error leaving voice channel:', error);
        await message.reply('❌ Gagal leave voice channel!');
    }
}

module.exports = { leaveCommand };
