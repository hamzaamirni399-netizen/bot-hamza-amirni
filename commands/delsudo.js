const { removeSudoer } = require('../lib/sudoers');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args) => {
    // Only the main owners (from settings) can remove admins
    const senderId = msg.key.participant || msg.key.remoteJid;
    const cleanSenderId = senderId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const mainOwners = (settings.ownerNumber || []).map(n => n.toString().replace(/[^0-9]/g, ''));
    const pairingNumber = (settings.pairingNumber || '').replace(/[^0-9]/g, '');

    if (!mainOwners.includes(cleanSenderId) && cleanSenderId !== pairingNumber && !msg.key.fromMe) {
        return sock.sendMessage(chatId, { text: '❌ هذا الأمر مخصص للمالك الرئيسي فقط!' }, { quoted: msg });
    }

    let target = '';

    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (args[0]) {
        target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    }

    if (!target) {
        return sock.sendMessage(chatId, { text: '❌ يرجى منشن الشخص أو كتابة رقمه لحذفه من المشرفين.' }, { quoted: msg });
    }

    const result = removeSudoer(target);
    await sock.sendMessage(chatId, { text: result.message }, { quoted: msg });
};
