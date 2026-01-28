const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');

async function reminiCommand(sock, chatId, msg, args, commands, userLang) {
    try {
        let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
            message: msg.message.extendedTextMessage.contextInfo.quotedMessage,
            key: {
                remoteJid: chatId,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
            }
        } : msg;

        const isImage = !!(quoted.message?.imageMessage || (quoted.message?.documentMessage && quoted.message.documentMessage.mimetype?.includes('image')));
        const isViewOnce = !!(quoted.message?.viewOnceMessage?.message?.imageMessage || quoted.message?.viewOnceMessageV2?.message?.imageMessage);

        if (!isImage && !isViewOnce) {
            return await sock.sendMessage(chatId, { text: t('ai_enhance.help', { prefix: settings.prefix }, userLang) }, { quoted: msg });
        }

        // Send reaction and status
        await sock.sendMessage(chatId, { react: { text: "🪄", key: msg.key } });
        await sock.sendMessage(chatId, { text: t('remini.wait', {}, userLang) }, { quoted: msg });

        // Download image
        const buffer = await downloadMediaMessage(quoted, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) throw new Error("Failed to download image.");

        // Upload to a temporary hosting (using Tioxy from uploader.js if available)
        const { uploadImage } = require('../lib/uploader');
        const imageUrl = await uploadImage(buffer);

        if (!imageUrl) throw new Error("Failed to upload image for processing.");

        // Call Vreden Remini API
        let resultUrl = null;
        try {
            const apiUrl = `https://api.vreden.my.id/api/remini?url=${encodeURIComponent(imageUrl)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (response.data && response.data.status && response.data.result) {
                resultUrl = response.data.result;
            }
        } catch (e) {
            console.log("Remini primary failed, trying fallback...");
        }

        // Fallback to Siputzx
        if (!resultUrl) {
            try {
                const response = await axios.get(`https://api.siputzx.my.id/api/ai/remini?url=${encodeURIComponent(imageUrl)}`);
                if (response.data?.status) {
                    resultUrl = response.data.data.url || response.data.data;
                }
            } catch (e) {
                console.error("Remini fallback failed:", e.message);
            }
        }

        if (resultUrl) {
            await sock.sendMessage(chatId, {
                image: { url: resultUrl },
                caption: `✨ *Successfully Enhanced!* ✅\n\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʜᴀᴍᴢᴀ ᴀᴍɪʀɴɪ`
            }, { quoted: msg });

            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("All Remini APIs failed.");
        }

    } catch (error) {
        console.error('Remini Error:', error.message);
        const errMsg = userLang === 'ma' ? "❌ *ماعندي كي ندير ليها دبا، عاود جرب من بعد.*" : "❌ *Remini processing failed. Try again later.*";
        await sock.sendMessage(chatId, { text: errMsg }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
}

module.exports = reminiCommand;
