const settings = require('../settings');

/**
 * Check if a user is the bot owner
 * @param {object} message - The WhatsApp message object
 * @returns {boolean} - True if user is owner
 */
function isOwner(message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid || '';

        // 1. Check if the message is from the bot itself
        if (message.key.fromMe) return true;

        // 2. Clean sender ID (handle JIDs like number@s.whatsapp.net, number:device@s.whatsapp.net, or long_id@lid)
        const cleanSenderId = senderId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const fullCleanId = senderId.split(':')[0]; // Keeps "@lid" or "@s.whatsapp.net" prefix-less

        // 3. Get owner numbers from settings
        const rawOwners = settings.ownerNumber || [];
        const ownerList = Array.isArray(rawOwners) ? rawOwners : [rawOwners];

        // 4. Get pairing number as fallback
        const pairingNumber = (settings.pairingNumber || '').toString().replace(/[^0-9]/g, '');

        // 5. Check against all potential owner indicators
        const { isSudo } = require('./sudoers');
        
        const isOwnerCheck = ownerList.some(nr => {
            const cleanNr = nr.toString().replace(/[^0-9]/g, '');
            if (!cleanNr) return false;

            // Strict matching: 
            // - Exact number match for standard JIDs
            // - Skip digit-only logic for @lid unless it's an exact match (LIDs are usually different)
            if (senderId.endsWith('@lid')) {
                return senderId === `${cleanNr}@lid` || cleanSenderId === cleanNr;
            }

            return cleanSenderId === cleanNr ||
                senderId === `${cleanNr}@s.whatsapp.net` ||
                (cleanNr.length >= 10 && cleanSenderId.endsWith(cleanNr));
        }) || (pairingNumber && !senderId.endsWith('@lid') && (cleanSenderId === pairingNumber || senderId.includes(pairingNumber)))
            || isSudo(senderId);


        return isOwnerCheck;
    } catch (error) {
        console.error('Error in isOwner check:', error);
        return false;
    }
}

/**
 * Send owner-only error message
 * @param {object} sock - WhatsApp socket
 * @param {string} chatId - Chat ID
 * @param {object} message - Message object
 */
async function sendOwnerOnlyMessage(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid || '';
    const cleanSenderId = senderId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const primaryOwner = Array.isArray(settings.ownerNumber) ? settings.ownerNumber[0] : settings.ownerNumber;

    await sock.sendMessage(chatId, {
        text: `❌ *هذا الأمر مخصص للمالك فقط!*

🔐 رقم المالك المسجل: ${primaryOwner}
📱 رقمك الحالي: ${cleanSenderId}

💡 إذا كنت المالك، تأكد من:
▪️ رقمك في settings.js هو: ${primaryOwner}
▪️ في حال استمر المشكل، انسخ رقمك الحالي أعلاه وضعه في settings.js

⚔️ ${settings.botName}`
    }, { quoted: message });
}

module.exports = {
    isOwner,
    sendOwnerOnlyMessage
};
