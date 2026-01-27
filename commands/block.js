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
        let targetJid = '';

        if (quotedMsg) {
            targetJid = quotedMsg.sender || quotedMsg.participant || (quotedMsg.key ? quotedMsg.key.participant : null);
        } else if (args && args.length > 0) {
            let number = args.join('').replace(/[^0-9]/g, '');
            if (number.length > 0) {
                targetJid = number + '@s.whatsapp.net';
            }
        }

        if (!targetJid) {
            return await sock.sendMessage(chatId, {
                text: `❌ *يرجى تحديد المستخدم!*\n\n• قم بالرد على رسالة الشخص\n• أو اكتب الرقم: ${settings.prefix}block 2126...`
            }, { quoted: msg });
        }

        // --- ROBUST JID CLEANING ---
        // decodeJid handles 123:1@s.whatsapp.net -> 123@s.whatsapp.net
        const cleanJid = sock.decodeJid(targetJid);

        console.log(`[Block] Attempting to block: ${cleanJid}`);

        // Block the user
        try {
            await sock.updateBlockStatus(cleanJid, 'block');

            const blockedNumber = cleanJid.split('@')[0];
            await sock.sendMessage(chatId, {
                text: `✅ *تم حظر المستخدم بنجاح!*\n\n👤 المستخدم: ${blockedNumber}\n🚫 الحالة: محظور`
            }, { quoted: msg });

        } catch (err) {
            if (err.message.includes('bad-request') || err.data === 400) {
                // If it's a @lid ID, Baileys might fail. Inform the user.
                if (cleanJid.endsWith('@lid')) {
                    throw new Error("هذا المستخدم يستخدم هوية مشفرة (LID) لا يمكن حظرها مباشرة أحياناً. حاول حظره يدوياً من تطبيق واتساب.");
                }
            }
            throw err;
        }

    } catch (error) {
        console.error('Error in block command:', error);
        const errorMsg = error.message || 'خطأ غير معروف';
        await sock.sendMessage(chatId, {
            text: `❌ فشلت العملية.\n⚠️ السبب: ${errorMsg}`
        }, { quoted: msg });
    }
}

module.exports = blockCommand;
