const axios = require('axios');
const settings = require('../settings');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

async function googleCommand(sock, chatId, msg, args) {
    const query = args.join(' ');
    if (!query) {
        return await sock.sendMessage(chatId, { text: `🔍 يرجى إدخال كلمة البحث!\nمثال: ${settings.prefix}google WhatsApp Bot` }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { react: { text: '🌐', key: msg.key } });

        const response = await axios.get(`https://api.siputzx.my.id/api/searching/google?query=${encodeURIComponent(query)}`);
        const results = response.data?.results || response.data?.data;

        if (!results || results.length === 0) {
            try {
                const altResponse = await axios.get(`https://api.davidcyriltech.my.id/google?query=${encodeURIComponent(query)}`);
                const altResults = altResponse.data?.results;
                if (altResults && altResults.length > 0) {
                    return sendCards(sock, chatId, msg, query, altResults);
                }
            } catch (e) { }

            return await sock.sendMessage(chatId, { text: '❌ لم يتم العثور على نتائج.' }, { quoted: msg });
        }

        await sendCards(sock, chatId, msg, query, results);

    } catch (error) {
        console.error('Google Search Error:', error);
        await sock.sendMessage(chatId, { text: '❌ حدث خطأ أثناء البحث.' }, { quoted: msg });
    }
}

async function sendCards(sock, chatId, msg, query, results) {
    const topResults = results.slice(0, 5);
    let cards = [];

    for (let res of topResults) {
        const genImage = await generateWAMessageContent(
            { image: { url: 'https://cdn4.iconfinder.com/data/icons/logos-brands-7/512/google_logo-google_ic-512.png' } },
            { upload: sock.waUploadToServer }
        );

        cards.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `${res.snippet}\n\n🔗 ${res.link}`
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: `乂 ${settings.botName} 🌐`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: res.title,
                hasMediaAttachment: true,
                imageMessage: genImage.imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "فتح الرابط 🔗",
                            url: res.link
                        })
                    }
                ]
            })
        });
    }

    const carouselMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: `🌐 *نتائج بحث جوجل لـ:* \`${query}\`` }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `© ${settings.botName}` }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, carouselMsg.message, { messageId: carouselMsg.key.id });
    await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
}

module.exports = googleCommand;
