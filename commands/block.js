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
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

        // Get target user
        let targetJid;

        if (quotedMsg && quotedParticipant) {
            // If replying to a message
            targetJid = quotedParticipant;
        } else if (args && args.length > 0) {
            // If number is provided
            let number = args.join('').replace(/[^0-9]/g, '');
            if (!number.endsWith('@s.whatsapp.net')) {
                targetJid = number + '@s.whatsapp.net';
            } else {
                targetJid = number;
            }
        } else {
            return await sock.sendMessage(chatId, {
                text: t('moderation.block_usage', { botName: settings.botName })
            }, { quoted: msg });
        }

        // Block the user
        // Block the user
        await sock.updateBlockStatus(targetJid, 'block');

        const blockedNumber = targetJid.replace('@s.whatsapp.net', '');

        await sock.sendMessage(chatId, {
            text: t('moderation.block_success', { user: blockedNumber, botName: settings.botName })
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in block command:', error);
        await sock.sendMessage(chatId, {
            text: t('moderation.block_error', { error: error.message })
        }, { quoted: msg });
    }
}

module.exports = blockCommand;
