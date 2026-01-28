const { igdl } = require("ruhend-scraper");
const { t } = require('../lib/language');
const settings = require('../settings');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

async function instagramCommand(sock, chatId, message, args, commands, userLang) {
    try {
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        // ✅ Step 1: Use passed args
        let url = args.join(' ').trim();

        // ✅ Step 2: If no args, fallback to quoted message text
        if (!url && message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = message.message.extendedTextMessage.contextInfo.quotedMessage;
            url =
                quoted.conversation ||
                quoted.extendedTextMessage?.text ||
                quoted.imageMessage?.caption ||
                quoted.videoMessage?.caption ||
                "";
            url = url.trim();
        }

        // ✅ Step 3: If still no text
        if (!url) {
            return await sock.sendMessage(
                chatId,
                { text: t('instagram.usage', {}, userLang) },
                { quoted: message }
            );
        }

        // ✅ Step 4: Validate Instagram link
        const instagramPatterns = [
            /https?:\/\/(?:www\.)?instagram\.com\//,
            /https?:\/\/(?:www\.)?instagr\.am\//,
            /https?:\/\/(?:www\.)?instagram\.com\/p\//,
            /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
            /https?:\/\/(?:www\.)?instagram\.com\/tv\//
        ];

        const isValidUrl = instagramPatterns.some((pattern) => pattern.test(url));
        if (!isValidUrl) {
            return await sock.sendMessage(
                chatId,
                { text: t('instagram.invalid_url', {}, userLang) },
                { quoted: message }
            );
        }

        // React 🔄 and send status while processing
        await sock.sendMessage(chatId, { text: t('instagram.wait', {}, userLang) }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: "🔄", key: message.key } });

        // ✅ Step 5: Fetch media
        let downloadData = await igdl(url).catch(() => null);

        // Fallback to Vreden API if ruhend fails
        if (!downloadData?.data?.length) {
            try {
                const vredenRes = await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodeURIComponent(url)}`);
                if (vredenRes.data?.status && vredenRes.data.result?.length) {
                    downloadData = { data: vredenRes.data.result.map(u => ({ url: u })) };
                }
            } catch (e) {
                console.error("Instagram fallback failed:", e.message);
            }
        }

        if (!downloadData?.data?.length) {
            return await sock.sendMessage(
                chatId,
                { text: t('instagram.no_media', {}, userLang) },
                { quoted: message }
            );
        }

        const caption = t('instagram.caption', { botName: settings.botName }, userLang);

        for (let i = 0; i < Math.min(20, downloadData.data.length); i++) {
            const media = downloadData.data[i];
            const mediaUrl = media.url;

            const isVideo =
                /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) ||
                media.type === "video" ||
                url.includes("/reel/") ||
                url.includes("/tv/");

            if (isVideo) {
                await sock.sendMessage(
                    chatId,
                    {
                        video: { url: mediaUrl },
                        mimetype: "video/mp4",
                        caption
                    },
                    { quoted: message }
                );
            } else {
                await sock.sendMessage(
                    chatId,
                    {
                        image: { url: mediaUrl },
                        caption
                    },
                    { quoted: message }
                );
            }
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: message.key } });
    } catch (error) {
        console.error("Error in Instagram command:", error);
        await sock.sendMessage(
            chatId,
            { text: t('instagram.error', {}, userLang) },
            { quoted: message }
        );
        await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
    }
}

module.exports = instagramCommand;
