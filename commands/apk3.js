const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');
const aptoide = require('../lib/aptoide');

async function apk3Command(sock, chatId, msg, args, commands, userLang) {
    const query = args.join(' ').trim();
    if (!query) {
        return await sock.sendMessage(chatId, { text: `• *Example:* .apk3 Facebook` }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🔍", key: msg.key } });

    try {
        const results = await aptoide.search(query);
        if (!results || results.length === 0) {
            return await sock.sendMessage(chatId, { text: `❌ No apps found.` });
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

        const L_LIB = t('apk.library_title', {}, userLang) || '🚀 *APK Server 3*';
        const L_RESULTS = t('apk.results_for', { query }, userLang) || `Results for: *${query}*`;
        const L_DOWNLOAD = t('apk.download_btn', {}, userLang) || 'Download Now 📥';

        let cards = [];
        for (let app of results.slice(0, 8)) {
            const imageMessage = await createHeaderImage(app.icon || 'https://ui-avatars.com/api/?name=APK&background=random&size=512');
            const pkg = app.package || app.id || 'N/A';
            const size = app.sizeMB || (app.size ? (app.size / (1024 * 1024)).toFixed(2) : 'N/A');

            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `🎮 *App:* ${app.name}\n📏 *Size:* ${size} MB\n🆔 *Pkg:* ${pkg}`
                }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `乂 ${settings.botName} 🧠` }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: app.author || app.name,
                    hasMediaAttachment: true,
                    imageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [{ "name": "quick_reply", "buttonParamsJson": JSON.stringify({ display_text: L_DOWNLOAD, id: `.apk ${pkg}` }) }]
                })
            });
        }

        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `${L_LIB}\n\n${L_RESULTS}` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `© ${settings.botName}` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('APK3 Error:', err);
        await sock.sendMessage(chatId, { text: '❌ Server 3 Busy.' });
    }
}

module.exports = apk3Command;
