const axios = require('axios');
const settings = require('../settings');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

// Utility: split long lyrics into safe chunks for WhatsApp
function chunkText(text, size = 3000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

async function lyricsCommand(sock, chatId, msg, args) {
    const songTitle = args.join(' ').trim();

    if (!songTitle) {
        const helpMsg = `🎵 *البحث عن كلمات الأغاني* 🎵\n\n🔹 *الاستخدام:* ${settings.prefix}lyrics [اسم الأغنية]`;
        return await sock.sendMessage(chatId, { text: helpMsg }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { react: { text: "🔍", key: msg.key } });

        const apiUrl = `https://apis.davidcyriltech.my.id/lyrics3?song=${encodeURIComponent(songTitle)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const json = response.data;

        if (!json.success || !json.result || !json.result.lyrics) {
            return await sock.sendMessage(chatId, { text: `❌ عذراً، لم أتمكن من العثور على كلمات الأغنية لـ "${songTitle}".` }, { quoted: msg });
        }

        const { song, artist, lyrics } = json.result;

        const genImage = await generateWAMessageContent(
            { image: { url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop' } },
            { upload: sock.waUploadToServer }
        );

        const card = {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `🎶 *الأغنية:* ${song || songTitle}\n👤 *الفنان:* ${artist || 'غير معروف'}`
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: `乂 ${settings.botName} 🎵`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: "كلمات الأغنية",
                hasMediaAttachment: true,
                imageMessage: genImage.imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({ display_text: "بحث عن أغنية أخرى 🔎", id: `${settings.prefix}lyrics ` })
                    }
                ]
            })
        };

        const interactiveMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        ...card,
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                            cards: [card]
                        })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, interactiveMsg.message, { messageId: interactiveMsg.key.id });

        const parts = chunkText(lyrics);
        for (const part of parts) {
            await sock.sendMessage(chatId, { text: part });
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error('Lyrics Error:', error);
        await sock.sendMessage(chatId, { text: `❌ حدث خطأ أثناء جلب كلمات الأغنية.` }, { quoted: msg });
    }
}

module.exports = lyricsCommand;
