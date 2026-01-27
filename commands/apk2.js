const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');
const { canDownload, DAILY_LIMIT } = require('../lib/apkLimiter');
const aptoide = require('../lib/aptoide');

async function apk2Command(sock, chatId, msg, args, commands, userLang) {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const text = args.join(' ').trim();

    const limitCheck = canDownload(senderId);
    if (!limitCheck.allowed) {
        return await sock.sendMessage(chatId, { text: t('apk.limit_reached', { limit: DAILY_LIMIT }, userLang) }, { quoted: msg });
    }

    if (!text) {
        return await sock.sendMessage(chatId, { text: `• *Example:* .apk2 WhatsApp` }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const searchResults = await aptoide.search(text);
        if (!searchResults || searchResults.length === 0) {
            return await sock.sendMessage(chatId, { text: `❌ No results found for "${text}"` }, { quoted: msg });
        }

        async function createHeaderImage(url) {
            try {
                const { imageMessage } = await generateWAMessageContent({ image: { url } }, { upload: sock.waUploadToServer });
                return imageMessage;
            } catch (e) {
                const fallback = 'https://ui-avatars.com/api/?name=APK&background=random&size=512';
                const { imageMessage } = await generateWAMessageContent({ image: { url: fallback } }, { upload: sock.waUploadToServer });
                return imageMessage;
            }
        }

        const L_LIB = t('apk.library_title', {}, userLang) || '🚀 *APK Downloader (Server 2)*';
        const L_RESULTS = t('apk.results_for', { query: text }, userLang) || `Results for: *${text}*`;
        const L_DOWNLOAD = t('apk.download_btn', {}, userLang) || 'Download Now 📥';

        let cards = [];
        for (let app of searchResults.slice(0, 10)) {
            const imageMessage = await createHeaderImage(app.icon || 'https://ui-avatars.com/api/?name=APK&background=random&size=512');
            const pkg = app.package || app.id || 'N/A';
            const size = app.sizeMB || (app.size ? (app.size / (1024 * 1024)).toFixed(2) : 'N/A');

            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: t('apk.item_desc', { name: app.name, size, package: pkg }, userLang)
                }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `乂 ${settings.botName} 🧠` }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: app.name,
                    hasMediaAttachment: true,
                    imageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [{ "name": "quick_reply", "buttonParamsJson": JSON.stringify({ display_text: L_DOWNLOAD, id: `.apk ${pkg}` }) }]
                })
            });
        }

        const menuMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `${L_LIB}\n\n${L_RESULTS}` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `© ${settings.botName} 2026` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, menuMsg.message, { messageId: menuMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error('Error in apk2 command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to search for apps.' });
    }
}

module.exports = {
    execute: apk2Command
};
