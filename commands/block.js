const { sendWithChannelButton } = require('../lib/channelButton');
const settings = require('../settings');
const { t } = require('../lib/language');

async function blockCommand(sock, chatId, msg, args) {
    const { isOwner, sendOwnerOnlyMessage } = require('../lib/ownerCheck');

    // Owner-only command
    if (!isOwner(msg)) {
        return await sendOwnerOnlyMessage(sock, chatId, msg);
    }

    try {
        const quotedMsg = msg.quoted ? msg.quoted : null;
        const quotedParticipant = quotedMsg ? (quotedMsg.participant || quotedMsg.key.participant) : null;

        // Get target user
        let targetJid;

        if (quotedParticipant) {
            // If replying to a message
            targetJid = quotedParticipant;
        } else if (args && args.length > 0) {
            // If number is provided
            let number = args.join('').replace(/[^0-9]/g, '');
            if (number.length > 0) {
                targetJid = number.endsWith('@s.whatsapp.net') ? number : number + '@s.whatsapp.net';
            }
        }

        if (!targetJid) {
            return await sock.sendMessage(chatId, {
                text: t('moderation.block_usage', { botName: settings.botName }) || `❌ *يرجى تحديد المستخدم!*\n\n• قم بالرد على رسالة الشخص\n• أو اكتب الرقم: ${settings.prefix}block 2126...`
            }, { quoted: msg });
        }

        // Normalize target JID
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const targetJidNormalized = jidNormalizedUser(targetJid);

        // Block the user
        await sock.updateBlockStatus(targetJidNormalized, 'block');

        const blockedNumber = targetJidNormalized.split('@')[0];

        await sock.sendMessage(chatId, {
            text: t('moderation.block_success', { user: blockedNumber, botName: settings.botName }) || `✅ *تم حظر المستخدم بنجاح!*\n\n👤 المستخدم: ${blockedNumber}\n🚫 الحالة: محظور`
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in block command:', error);
        await sock.sendMessage(chatId, {
            text: t('moderation.block_error', { error: error.message }) || `❌ حدث خطأ أثناء الحظر: ${error.message}`
        }, { quoted: msg });
    }
}

module.exports = blockCommand;
