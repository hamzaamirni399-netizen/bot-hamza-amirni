const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');
const { canDownload, incrementDownload, DAILY_LIMIT } = require('../lib/apkLimiter');
const aptoide = require('../lib/aptoide');
const fs = require('fs');
const path = require('path');

async function apkCommand(sock, chatId, msg, args, commands, userLang) {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const query = args.join(' ').trim();

    const limitCheck = canDownload(senderId);
    if (!limitCheck.allowed) {
        return await sock.sendMessage(chatId, { text: t('apk.limit_reached', { limit: DAILY_LIMIT }, userLang) }, { quoted: msg });
    }

    if (!query) {
        return await sock.sendMessage(chatId, { text: `• *Example:* .apk WhatsApp` }, { quoted: msg });
    }

    // --- DOWNLOAD MODE (Triggered by Button or Direct Package Name) ---
    // Only trigger download if it looks like a package ID (must have a dot)
    // Example: com.whatsapp, com.facebook.lite
    const isPackageId = query && !query.includes(' ') && query.includes('.') && /^[a-z0-9_\-]+(\.[a-z0-9_\-]+)+$/i.test(query);

    if (isPackageId) {
        try {
            console.log(`[APK] 📥 ENTERING DOWNLOAD MODE | Query: "${query}" | Args Length: ${args.length}`);
            await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

            console.log(`[APK] 🔍 Fetching info for: ${query}...`);
            const app = await aptoide.downloadInfo(query);

            if (!app || !app.downloadUrl) {
                console.log(`[APK] ❌ Direct resolution failed (No data or No URL) for: ${query}`);
                throw new Error('Direct download failed'); // Trigger fallback to search
            }

            console.log(`[APK] ✅ Resolved: ${app.name} (${app.sizeMB} MB)`);

            const sizeMB = parseFloat(app.sizeMB || 0);
            if (sizeMB > 350) {
                console.log(`[APK] ⚠️ File too large: ${sizeMB} MB`);
                return await sock.sendMessage(chatId, { text: `⚠️ App too large (${sizeMB} MB). Limit: 350MB.` }, { quoted: msg });
            }

            const L_SENDING = t('common.wait', {}, userLang) || '⏳ Sending file...';
            console.log(`[APK] 📤 Sending document to ${chatId}...`);
            await sock.sendMessage(chatId, { text: L_SENDING }, { quoted: msg });

            const caption = t('apk.caption', {
                name: app.name,
                package: app.package || query,
                updated: app.updated || 'Latest',
                size: app.sizeMB || 'N/A',
                botName: settings.botName
            }, userLang);

            await sock.sendMessage(chatId, {
                document: { url: app.downloadUrl },
                fileName: `${app.name || 'App'}.apk`,
                mimetype: 'application/vnd.android.package-archive',
                caption: caption
            }, { quoted: msg });

            console.log(`[APK] ✨ Successfully sent: ${app.name}`);
            incrementDownload(senderId);
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
            return;
        } catch (e) {
            console.error('[APK] ❌ Download Mode Error:', e.message);
            // Fallback to Search Mode below
        }
    }

    // --- SEARCH MODE (Carousel) ---
    await sock.sendMessage(chatId, { react: { text: "🔍", key: msg.key } });

    try {
        const results = await aptoide.search(query);
        if (!results || results.length === 0) {
            return await sock.sendMessage(chatId, { text: `❌ No results for "${query}"` }, { quoted: msg });
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

        const L_LIB = t('apk.library_title', {}, userLang) || '🚀 *Premium APK Library*';
        const L_RESULTS = t('apk.results_for', { query }, userLang) || `Results for: *${query}*`;
        const L_DOWNLOAD = t('apk.download_btn', {}, userLang) || 'Download Now 📥';

        let cards = [];
        for (let app of results.slice(0, 10)) {
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

    } catch (error) {
        console.error('APK Error:', error);
        await sock.sendMessage(chatId, { text: '❌ System error.' });
    }
}

module.exports = apkCommand;
