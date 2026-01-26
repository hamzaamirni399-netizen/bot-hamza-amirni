const { addSudoer } = require('../lib/sudoers');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args) => {
    // Only the main owners (from settings) can add new admins
    const senderId = msg.key.participant || msg.key.remoteJid;
    const cleanSenderId = senderId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const mainOwners = (settings.ownerNumber || []).map(n => n.toString().replace(/[^0-9]/g, ''));
    const pairingNumber = (settings.pairingNumber || '').replace(/[^0-9]/g, '');

    if (!mainOwners.includes(cleanSenderId) && cleanSenderId !== pairingNumber && !msg.key.fromMe) {
        return sock.sendMessage(chatId, { text: '❌ هذا الأمر مخصص للمالك الرئيسي فقط!' }, { quoted: msg });
    }

    let target = '';
    let name = '';

    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        name = args.slice(1).join(' ') || 'مشرف بوت';
    } else if (args[0]) {
        target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        name = args.slice(1).join(' ') || 'مشرف بوت';
    }

    if (!target) {
        return sock.sendMessage(chatId, { text: '❌ يرجى منشن الشخص أو كتابة رقمه.\nمثال: .addsudo @mention Hamza' }, { quoted: msg });
    }

    const result = addSudoer(target, name);
    await sock.sendMessage(chatId, { text: result.message }, { quoted: msg });
};
