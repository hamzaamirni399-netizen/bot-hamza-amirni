const { igdl } = require("ruhend-scraper");
const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

const instagramDownload = async (url) => {
    return new Promise(async (resolve) => {
        if (!url.match(/\/(reel|reels|p|stories|tv|s)\/[a-zA-Z0-9_-]+/i)) {
            return resolve({ status: false, msg: "Invalid URL" });
        }

        try {
            let jobResponse = await axios.post(
                "https://app.publer.io/hooks/media",
                {
                    url: url,
                    iphone: false,
                },
                {
                    headers: {
                        Accept: "*/*",
                        "Accept-Encoding": "gzip, deflate, br, zstd",
                        "Accept-Language": "es-ES,es;q=0.9",
                        "Cache-Control": "no-cache",
                        Origin: "https://publer.io",
                        Pragma: "no-cache",
                        Priority: "u=1, i",
                        Referer: "https://publer.io/",
                        "Sec-CH-UA": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                        "Sec-CH-UA-Mobile": "?0",
                        "Sec-CH-UA-Platform": '"Windows"',
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                    },
                }
            );

            let jobId = jobResponse.data.job_id;
            let status = "working";
            let jobStatusResponse;

            let retries = 0;
            while (status !== "complete" && retries < 20) {
                await new Promise(r => setTimeout(r, 1000));
                jobStatusResponse = await axios.get(
                    `https://app.publer.io/api/v1/job_status/${jobId}`,
                    {
                        headers: {
                            Accept: "application/json, text/plain, */*",
                            "Accept-Encoding": "gzip, deflate, br, zstd",
                            "Accept-Language": "es-ES,es;q=0.9",
                            "Cache-Control": "no-cache",
                            Origin: "https://publer.io",
                            Pragma: "no-cache",
                            Priority: "u=1, i",
                            Referer: "https://publer.io/",
                            "Sec-CH-UA": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                            "Sec-CH-UA-Mobile": "?0",
                            "Sec-CH-UA-Platform": '"Windows"',
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                        },
                    }
                );
                status = jobStatusResponse.data.status;
                retries++;
            }

            if (status !== 'complete') {
                return resolve({ status: false, msg: "Timeout waiting for Publer" });
            }

            let data = jobStatusResponse.data.payload.map((item) => {
                return {
                    type: item.type === "photo" ? "image" : "video",
                    url: item.path,
                };
            });

            resolve({
                status: true,
                data,
            });
        } catch (e) {
            resolve({
                status: false,
                msg: new Error(e).message,
            });
        }
    });
};

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

        // ✅ Step 5: Fetch media using Publer (Primary)
        let downloadData = null;
        console.log("Trying Publer...");
        const publerResult = await instagramDownload(url);

        if (publerResult.status && publerResult.data.length > 0) {
            downloadData = { data: publerResult.data };
            console.log("✅ Publer Success");
        } else {
            console.log("⚠️ Publer failed:", publerResult.msg);

            // Fallback 1: ruhend-scraper
            console.log("Trying ruhend-scraper...");
            const ruhendData = await igdl(url).catch(() => null);
            if (ruhendData?.data?.length) {
                downloadData = ruhendData;
                console.log("✅ ruhend-scraper Success");
            } else {
                // Fallback 2: Vreden API
                console.log("Trying Vreden fallback...");
                try {
                    const vredenRes = await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodeURIComponent(url)}`);
                    if (vredenRes.data?.status && vredenRes.data.result?.length) {
                        downloadData = { data: vredenRes.data.result.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' })) };
                        console.log("✅ Vreden Success");
                    }
                } catch (e) {
                    console.error("Vreden fallback failed:", e.message);
                }
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

        for (const media of downloadData.data) {
            const mediaUrl = media.url;
            // Determine type if not provided
            const isVideo = media.type === 'video' || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || (url.includes("/reel/") && !media.type);

            if (isVideo) {
                await sock.sendMessage(chatId, {
                    video: { url: mediaUrl },
                    mimetype: "video/mp4",
                    caption
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    image: { url: mediaUrl },
                    caption
                }, { quoted: message });
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

instagramCommand.command = ['instagram', 'ig', 'igdl', 'instagramdl'];
instagramCommand.tags = ['downloader'];
instagramCommand.desc = 'تحميل فيديو أو صور من إنستقرام';

module.exports = instagramCommand;
