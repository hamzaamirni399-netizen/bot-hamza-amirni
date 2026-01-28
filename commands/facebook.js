const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { sendWithChannelButton } = require('../lib/channelButton');
const { getCommandDescription } = require('../lib/commandDescriptions');
const { t } = require('../lib/language');
const settings = require('../settings');

async function getInstaTiktokVideo(url) {
    const SITE_URL = 'https://instatiktok.com/';
    const form = new URLSearchParams();
    form.append('url', url);
    form.append('platform', 'facebook');
    form.append('siteurl', SITE_URL);

    const res = await axios.post(`${SITE_URL}api`, form.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': SITE_URL,
            'Referer': SITE_URL,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
    });

    if (!res.data || res.data.status !== 'success') return null;

    const $ = cheerio.load(res.data.html);
    const links = [];
    $('a.btn[href^="http"]').each((_, el) => {
        const link = $(el).attr('href');
        if (link && !links.includes(link)) links.push(link);
    });

    return links.length > 0 ? links.at(-1) : null;
}

// 🆕 New API Helper (User Provided Logic)
async function getVideoFromFlyDev(url) {
    try {
        const payload = new URLSearchParams();
        payload.append('url', url);

        const response = await axios.post('https://facebook-video-downloader.fly.dev/app/main.php', payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        const data = response.data;
        if (data && data.success && data.links) {
            // Try High Quality first, then Low Quality
            const hd = data.links['Download High Quality'];
            const sd = data.links['Download Low Quality'];
            return {
                video: hd || sd,
                title: data.title
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function facebookCommand(sock, chatId, msg, args, commands, userLang) {
    try {
        const url = args.join(' ').trim();

        if (!url) {
            return await sendWithChannelButton(sock, chatId, t('download.fb_usage', {}, userLang), msg);
        }

        // Validate Facebook URL
        if (!url.match(/(facebook\.com|fb\.watch|fb\.com)/i)) {
            return await sendWithChannelButton(sock, chatId, t('download.fb_no_url', {}, userLang), msg);
        }

        // Send loading status and reaction
        await sock.sendMessage(chatId, { text: t('download.fb_downloading', {}, userLang) }, { quoted: msg });
        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: msg.key }
        });

        // 0. 🆕 Try FlyDev API (User's suggested fix - Primary)
        try {
            const flyResult = await getVideoFromFlyDev(url);
            if (flyResult && flyResult.video) {
                console.log('✅ Found video using FlyDev API');
                await sendVideo(sock, chatId, flyResult.video, "FlyDev API", msg, userLang);
                return;
            }
        } catch (e) {
            console.log('⚠️ FlyDev API failed, trying fallback...');
        }

        // 1. Try InstaTiktok API (User Provided)
        try {
            const fbvid = await getInstaTiktokVideo(url);
            if (fbvid) {
                console.log('✅ Found video using InstaTiktok');
                await sendVideo(sock, chatId, fbvid, "InstaTiktok", msg, userLang);
                return;
            }
        } catch (e) {
            console.log('⚠️ InstaTiktok failed, trying fallback...');
        }

        // 2. Try Hanggts API (User's choice)
        try {
            const apiUrl = `https://api.hanggts.xyz/download/facebook?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });

            let fbvid = null;
            const data = response.data;

            if (data && (data.status === true || data.result)) {
                // Try to extract video URL
                if (data.result?.media?.video_hd) fbvid = data.result.media.video_hd;
                else if (data.result?.media?.video_sd) fbvid = data.result.media.video_sd;
                else if (data.result?.url) fbvid = data.result.url;
                else if (data.result?.download) fbvid = data.result.download;
                else if (typeof data.result === 'string') fbvid = data.result;
            }

            if (fbvid) {
                console.log('✅ Found video using Hanggts API');
                await sendVideo(sock, chatId, fbvid, "Hanggts API", msg, userLang);
                return;
            }
        } catch (e) {
            console.log('⚠️ Hanggts API failed, trying fallback...');
        }

        // 2. Fallback: Ryzendesu API
        try {
            const apiUrl = `https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });

            const data = response.data;
            if (data && data.url && Array.isArray(data.url)) {
                // Find HD or first available
                const hd = data.url.find(v => v.quality === 'hd' || v.quality === '720p');
                const sd = data.url.find(v => v.quality === 'sd');
                const fbvid = hd?.url || sd?.url || data.url[0]?.url;

                if (fbvid) {
                    console.log('✅ Found video using Ryzendesu API');
                    await sendVideo(sock, chatId, fbvid, "Ryzendesu API", msg, userLang);
                    return;
                }
            } else if (data && data.data && Array.isArray(data.data)) {
                const fbvid = data.data[0]?.url;
                if (fbvid) {
                    console.log('✅ Found video using Ryzendesu API (Format 2)');
                    await sendVideo(sock, chatId, fbvid, "Ryzendesu API", msg, userLang);
                    return;
                }
            }
        } catch (e) {
            console.log('⚠️ Ryzendesu API failed, trying fallback...');
        }

        // 3. Fallback: GuruAPI
        try {
            const apiUrl = `https://api.guruapi.tech/fbvideo?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });

            const data = response.data;
            if (data && data.result) {
                const fbvid = data.result.hd || data.result.sd;
                if (fbvid) {
                    console.log('✅ Found video using GuruAPI');
                    await sendVideo(sock, chatId, fbvid, "GuruAPI", msg, userLang);
                    return;
                }
            }
        } catch (e) {
            console.log('⚠️ GuruAPI failed...');
        }

        // 4. Fallback: SnapSave API
        try {
            const apiUrl = `https://api.snapsave.app/v1/facebook?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const data = response.data;
            if (data && data.data) {
                const fbvid = data.data.hd || data.data.sd || data.data.url;
                if (fbvid) {
                    console.log('✅ Found video using SnapSave API');
                    await sendVideo(sock, chatId, fbvid, "SnapSave", msg, userLang);
                    return;
                }
            }
        } catch (e) {
            console.log('⚠️ SnapSave API failed...');
        }

        // 5. Fallback: SaveFrom.net API
        try {
            const apiUrl = `https://api.savefrom.net/api/facebook?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });

            const data = response.data;
            if (data && data.url) {
                const fbvid = Array.isArray(data.url) ? data.url[0]?.url || data.url[0] : data.url;
                if (fbvid) {
                    console.log('✅ Found video using SaveFrom API');
                    await sendVideo(sock, chatId, fbvid, "SaveFrom", msg, userLang);
                    return;
                }
            }
        } catch (e) {
            console.log('⚠️ SaveFrom API failed...');
        }

        // 6. Fallback: Publer API (Robust)
        try {
            const apiUrl = `https://v12.api.shorts.zip/facebook?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 20000 });

            const data = response.data;
            if (data && data.success && data.data && data.data.length > 0) {
                const fbvid = data.data[0].url;
                if (fbvid) {
                    console.log('✅ Found video using Publer API');
                    await sendVideo(sock, chatId, fbvid, "Publer", msg, userLang);
                    return;
                }
            }
        } catch (e) {
            console.log('⚠️ Publer API failed...');
        }

        // 7. Fallback: 8388 API
        try {
            const apiUrl = `https://api.8388.8388.8388.8388.xyz/api/download/facebook?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, {
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (response.data && response.data.status && response.data.url) {
                console.log('✅ Found video using 8388 API');
                await sendVideo(sock, chatId, response.data.url, "8388 API", msg, userLang);
                return;
            }
        } catch (e) {
            console.log('⚠️ 8388 API failed...');
        }

        throw new Error('All APIs failed to fetch video');

    } catch (error) {
        console.error('Error in Facebook command:', error);
        await sendWithChannelButton(sock, chatId, t('download.fb_error', {}, userLang) + `\n${error.message}`, msg);
    }
}

// Helper to send video
async function sendVideo(sock, chatId, videoUrl, apiName, quoted, userLang) {
    try {
        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: t('download.fb_success', { source: apiName, botName: settings.botName }, userLang),
            mimetype: 'video/mp4'
        }, { quoted: quoted });
    } catch (e) {
        console.error('Error sending video URL, trying buffer:', e.message);
        try {
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const tempFile = path.join(tempDir, `fb_${Date.now()}.mp4`);

            try {
                // Check size before downloading (Stability)
                const headRes = await axios.head(videoUrl, { timeout: 15000 }).catch(() => null);
                const contentLength = headRes ? headRes.headers['content-length'] : null;
                const maxSize = 250 * 1024 * 1024; // 250MB

                if (contentLength && parseInt(contentLength) > maxSize) {
                    throw new Error(`large_file:${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB`);
                }

                const writer = fs.createWriteStream(tempFile);
                const response = await axios({
                    url: videoUrl,
                    method: 'GET',
                    responseType: 'stream',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 600000
                });

                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                const stats = fs.statSync(tempFile);
                if (stats.size > maxSize) throw new Error("large_file");

                await sock.sendMessage(chatId, {
                    video: { url: tempFile },
                    caption: t('download.fb_success', { source: apiName, botName: settings.botName }, userLang),
                    mimetype: 'video/mp4'
                }, { quoted: quoted });

            } finally {
                if (fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                }
            }
        } catch (bufferError) {
            console.error('Buffer send failed:', bufferError.message);
            const isLarge = bufferError.message.includes('large_file');
            const errorText = isLarge
                ? t('download.fb_large', {}, userLang)
                : t('download.fb_failed', {}, userLang);

            await sock.sendMessage(chatId, { text: errorText }, { quoted: quoted });
        }
    }
}

facebookCommand.command = ['fb', 'facebook'];
facebookCommand.tags = ['downloader'];
facebookCommand.desc = 'تحميل فيديوهات فيسبوك';

module.exports = facebookCommand;
