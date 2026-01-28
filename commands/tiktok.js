const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

// Resolve short TikTok URLs (vm.tiktok.com, vt.tiktok.com, etc.)
async function resolveTikTokUrl(url) {
    try {
        const response = await axios.get(url, { maxRedirects: 0, validateStatus: null });
        if (response.status >= 300 && response.status < 400 && response.headers.location) {
            return response.headers.location;
        }
    } catch (e) {
        console.error("URL resolution failed:", e.message);
    }
    return url; // fallback to original if resolution fails
}

async function tiktokCommand(sock, chatId, message, args, commands, userLang) {
    try {
        if (processedMessages.has(message.key.id)) {
            return;
        }

        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        // ✅ Step 1: Use passed args
        let url = args.join(' ').trim();

        // ✅ Step 2: If no args, check quoted/replied message
        if (!url) {
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText =
                quotedMessage?.conversation ||
                quotedMessage?.extendedTextMessage?.text ||
                quotedMessage?.imageMessage?.caption ||
                quotedMessage?.videoMessage?.caption ||
                "";

            url = quotedText.trim();
        }

        if (!url) {
            return await sock.sendMessage(chatId, {
                text: t('tiktok.no_url', {}, userLang)
            });
        }

        const tiktokPatterns = [
            /https?:\/\/(?:www\.)?tiktok\.com\//,
            /https?:\/\/(?:vm\.)?tiktok\.com\//,
            /https?:\/\/(?:vt\.)?tiktok\.com\//,
            /https?:\/\/(?:www\.)?tiktok\.com\/@/,
            /https?:\/\/(?:www\.)?tiktok\.com\/t\//
        ];

        const isValidUrl = tiktokPatterns.some(pattern => pattern.test(url));
        if (!isValidUrl) {
            return await sock.sendMessage(chatId, {
                text: t('tiktok.invalid_url', {}, userLang)
            });
        }

        await sock.sendMessage(chatId, { text: t('tiktok.wait', {}, userLang) }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

        try {
            // ✅ Resolve short TikTok URLs before API call
            let finalUrl = await resolveTikTokUrl(url);

            // Use API for download
            let videoUrl = null;
            let author = 'N/A';
            let title = 'N/A';

            // 1. Primary API
            try {
                const apiUrl = `https://adiza-tiktok-downloader.matrixzat99.workers.dev/?url=${encodeURIComponent(finalUrl)}`;
                const apiResponse = await axios.get(apiUrl, { timeout: 10000 });
                if (apiResponse.data?.success && apiResponse.data.download) {
                    videoUrl = apiResponse.data.download.video_hd || apiResponse.data.download.video_sd;
                    author = apiResponse.data.tiktok_info?.author || 'N/A';
                    title = apiResponse.data.tiktok_info?.title || 'N/A';
                }
            } catch (e) {
                console.log("TikTok primary failed, trying fallback 1...");
            }

            // 2. Fallback 1: Siputzx
            if (!videoUrl) {
                try {
                    const siputzRes = await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(finalUrl)}`);
                    if (siputzRes.data?.status) {
                        videoUrl = siputzRes.data.data.video || siputzRes.data.data.url;
                        author = siputzRes.data.data.author || 'N/A';
                        title = siputzRes.data.data.title || 'N/A';
                    }
                } catch (e) {
                    console.log("TikTok fallback 1 failed, trying fallback 2...");
                }
            }

            // 3. Fallback 2: Vreden
            if (!videoUrl) {
                try {
                    const vredenRes = await axios.get(`https://api.vreden.web.id/api/tiktok?url=${encodeURIComponent(finalUrl)}`);
                    if (vredenRes.data?.status) {
                        videoUrl = vredenRes.data.result.video;
                        author = vredenRes.data.result.author || 'N/A';
                        title = vredenRes.data.result.description || 'N/A';
                    }
                } catch (e) {
                    console.error("TikTok fallback 2 failed:", e.message);
                }
            }

            if (videoUrl) {
                const caption = t('tiktok.caption', {
                    botName: settings.botName,
                    title: title,
                    author: author,
                    url: finalUrl
                }, userLang);

                await sock.sendMessage(chatId, {
                    video: { url: videoUrl },
                    mimetype: "video/mp4",
                    caption
                }, { quoted: message });

                await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
                return;
            }

            await sock.sendMessage(chatId, {
                text: t('tiktok.download_failed', {}, userLang)
            });

        } catch (error) {
            console.error('Error in TikTok download:', error);
            await sock.sendMessage(chatId, {
                text: t('tiktok.download_failed')
            });
        }
    } catch (error) {
        console.error('Error in TikTok command:', error);
        await sock.sendMessage(chatId, {
            text: t('tiktok.error_generic', {}, userLang)
        });
    }
}

module.exports = tiktokCommand;
