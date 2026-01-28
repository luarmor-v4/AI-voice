// src/utils/voice.js
// File ini memastikan sodium-native ter-load dengan benar

const logger = require('./logger');

function checkVoiceDependencies() {
    try {
        // Check sodium-native
        const sodium = require('sodium-native');
        logger.info('✅ sodium-native loaded successfully');
        return true;
    } catch (error) {
        logger.warn('⚠️ sodium-native not available, trying libsodium-wrappers...');
        
        try {
            const sodium = require('libsodium-wrappers');
            logger.info('✅ libsodium-wrappers loaded successfully');
            return true;
        } catch (error2) {
            logger.error('❌ No sodium library available!');
            return false;
        }
    }
}

module.exports = { checkVoiceDependencies };
