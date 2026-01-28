const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    try {
        const url = args[0] || (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);

        if (!url || !/twitter\.com|x\.com/.test(url)) {
            return await sock.sendMessage(chatId, { text: '❌ Please provide a valid Twitter/X link!' }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

        // Using a reliable download API
        let videoUrl = null;
        let username = 'N/A';
        let caption_text = 'No caption';

        try {
            const response = await axios.get(`https://api.vreden.web.id/api/twitter?url=${encodeURIComponent(url)}`);
            if (response.data?.status) {
                videoUrl = response.data.result.video_sd || response.data.result.video_hd || response.data.result.video;
                username = response.data.result.username || 'N/A';
                caption_text = response.data.result.caption || 'No caption';
            }
        } catch (e) {
            console.log("Twitter primary API failed, trying fallback...");
        }

        // Fallback
        if (!videoUrl) {
            try {
                const response = await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(url)}`);
                if (response.data?.status) {
                    videoUrl = response.data.data.video || response.data.data.url;
                }
            } catch (e) {
                console.error("Twitter fallback failed:", e.message);
            }
        }

        if (!videoUrl) {
            throw new Error('No video found in the response');
        }

        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `✅ *Twitter Downloader*\n\n👤 *User:* ${username}\n📝 *Caption:* ${caption_text}\n\n© ${settings.botName}`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('Error in twitter command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to download Twitter video. Please try again later.' }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
