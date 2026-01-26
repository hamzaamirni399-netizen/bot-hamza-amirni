const axios = require('axios');
const yts = require('yt-search');
const { t } = require('../lib/language');
const settings = require('../settings');
const crypto = require('crypto');
const FormData = require('form-data');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

// --- NEW SCRAMPERS ---

async function getSiputzxVideo(url) {
    const baseURL = 'https://backand-ytdl.siputzx.my.id/api';
    const headers = {
        'authority': 'backand-ytdl.siputzx.my.id',
        'accept': '*/*',
        'origin': 'https://yuyuyu.siputzx.my.id',
        'referer': 'https://yuyuyu.siputzx.my.id/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36'
    };

    const formData1 = new FormData();
    formData1.append('url', url);

    const infoResponse = await axios.post(`${baseURL}/get-info`, formData1, {
        headers: { ...headers, ...formData1.getHeaders() }
    });
    const videoInfo = infoResponse.data;

    const formData2 = new FormData();
    formData2.append('id', videoInfo.id);
    formData2.append('format', 'mp4');
    formData2.append('video_format_id', '18');
    formData2.append('audio_format_id', '251');
    formData2.append('info', JSON.stringify(videoInfo));

    const jobResponse = await axios.post(`${baseURL}/create_job`, formData2, {
        headers: { ...headers, ...formData2.getHeaders() }
    });
    const jobId = jobResponse.data.job_id;

    for (let i = 0; i < 30; i++) {
        const statusResponse = await axios.get(`${baseURL}/check_job/${jobId}`, { headers });
        const status = statusResponse.data;
        if (status.status === 'completed') {
            return {
                download: `https://backand-ytdl.siputzx.my.id${status.download_url}`,
                title: videoInfo.title
            };
        }
        if (status.status === 'failed') break;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Siputzx conversion failed');
}

const savetube = {
    api: { base: "https://media.savetube.me/api", cdn: "/random-cdn", info: "/v2/info", download: "/download" },
    headers: { 'accept': '*/*', 'content-type': 'application/json', 'origin': 'https://yt.savetube.me', 'referer': 'https://yt.savetube.me/', 'user-agent': 'Postify/1.0.0' },
    crypto: {
        hexToBuffer: (hexString) => Buffer.from(hexString.match(/.{1,2}/g).join(''), 'hex'),
        decrypt: async (enc) => {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.crypto.hexToBuffer(secretKey);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return JSON.parse(decrypted.toString());
        }
    }
};

async function getSavetubeVideo(url, quality = '720') {
    const videoId = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
    if (!videoId) throw new Error('Invalid YouTube ID');

    const cdnRes = await axios.get(`${savetube.api.base}${savetube.api.cdn}`, { headers: savetube.headers });
    const cdn = cdnRes.data.cdn;

    const infoRes = await axios.post(`https://${cdn}${savetube.api.info}`, { url: `https://www.youtube.com/watch?v=${videoId}` }, { headers: savetube.headers });
    const decrypted = await savetube.crypto.decrypt(infoRes.data.data);

    const dlRes = await axios.post(`https://${cdn}${savetube.api.download}`, {
        id: videoId,
        downloadType: 'video',
        quality: quality,
        key: decrypted.key
    }, { headers: savetube.headers });

    if (dlRes.data?.data?.downloadUrl) {
        return { download: dlRes.data.data.downloadUrl, title: decrypted.title };
    }
    throw new Error('Savetube failed');
}

async function getSavenowVideo(url, quality = '720') {
    const res = await axios.get('https://p.savenow.to/ajax/download.php', {
        params: { copyright: '0', format: quality, url, api: 'dfcb6d76f2f6a9894gjkege8a4ab232222' },
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://y2down.cc/', Origin: 'https://y2down.cc' }
    });

    const progressUrl = res.data?.progress_url;
    if (!progressUrl) throw new Error('Savenow failed to start');

    for (let i = 0; i < 30; i++) {
        const status = await axios.get(progressUrl);
        if (status.data?.download_url) return { download: status.data.download_url, title: res.data.info?.title || 'Video' };
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Savenow timeout');
}

// --- LEGACY FALLBACKS ---

async function getYupraVideoByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp4 returned no mp4');
}

async function videoCommand(sock, chatId, msg, args, commands, userLang, match) {
    try {
        const searchQuery = match || args.join(' ') || (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').replace(/^\/?.+?\s/, '').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: t('video.usage', {}, userLang) }, { quoted: msg });
            return;
        }

        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

        if (searchQuery.startsWith('http')) {
            videoUrl = searchQuery;
        } else {
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: t('download.yt_no_result', {}, userLang) }, { quoted: msg });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!ytId) {
            await sock.sendMessage(chatId, { text: t('download.yt_invalid_url', {}, userLang) }, { quoted: msg });
            return;
        }

        // Send thumbnail/info
        try {
            const thumb = videoThumbnail || `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;
            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: t('video.downloading', { title: videoTitle || searchQuery }, userLang)
            }, { quoted: msg });
        } catch (e) { }

        let videoData = null;

        // Try methods sequentially
        const methods = [
            () => getSiputzxVideo(videoUrl),
            () => getSavetubeVideo(videoUrl),
            () => getSavenowVideo(videoUrl),
            () => getYupraVideoByUrl(videoUrl),
            () => getOkatsuVideoByUrl(videoUrl)
        ];

        for (const method of methods) {
            try {
                videoData = await method();
                if (videoData) break;
            } catch (e) {
                console.log(`[VIDEO] Method failed: ${e.message}`);
            }
        }

        if (!videoData) throw new Error("All download methods failed.");

        const finalUrl = videoData.download || videoData.downloadUrl || videoData.url;
        await sock.sendMessage(chatId, {
            video: { url: finalUrl },
            mimetype: 'video/mp4',
            fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
            caption: t('video.success', { botName: settings.botName }, userLang)
        }, { quoted: msg });

    } catch (error) {
        console.error('[VIDEO] Error:', error.message);
        await sock.sendMessage(chatId, { text: t('download.yt_error', {}, userLang) + `: ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
}

module.exports = videoCommand;

