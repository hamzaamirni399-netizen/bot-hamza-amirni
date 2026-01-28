const axios = require('axios');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');

/**
 * قرآن MP3 - البحث عن القراء وعرضهم في بطاقات
 */
async function quranMp3Command(sock, chatId, msg, args, commands, userLang) {
    const query = args.join(' ').trim();

    await sock.sendMessage(chatId, { react: { text: "🕌", key: msg.key } });

    try {
        // Fetch reciters from MP3Quran API
        const response = await axios.get('https://mp3quran.net/api/v3/reciters?language=ar', { timeout: 10000 });
        let reciters = response.data.reciters;

        if (query) {
            reciters = reciters.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
        } else {
            // Show popular ones if no query
            const popularNames = ['مشاري العفاسي', 'عبد الباسط عبد الصمد', 'ماهر المعيقلي', 'سعود الشريم', 'ياسر الدوسري', 'أحمد العجمي', 'سعد الغامدي', 'فارس عباد', 'منشاوي', 'الحصري'];
            reciters = reciters.filter(r => popularNames.some(p => r.name.includes(p))).slice(0, 10);
        }

        if (!reciters || reciters.length === 0) {
            return await sock.sendMessage(chatId, {
                text: userLang === 'ma' ? "❌ مالقيت حتى قارئ بهاد السمية." : "❌ لم يتم العثور على قراء بهذا الاسم."
            }, { quoted: msg });
        }

        // Limit to 10 for carousel stability
        const topReciters = reciters.slice(0, 10);

        async function createHeaderImage(name) {
            try {
                // Generate a nice avatar for the reciter
                const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=006400&color=FFFFFF&size=512&font-size=0.35&bold=true`;
                const { imageMessage } = await generateWAMessageContent({ image: { url } }, { upload: sock.waUploadToServer });
                return imageMessage;
            } catch (e) {
                const fallback = 'https://telegra.ph/file/ed156b8207f2ef84fbf8d.jpg'; // Mosque fallback
                const { imageMessage } = await generateWAMessageContent({ image: { url: fallback } }, { upload: sock.waUploadToServer });
                return imageMessage;
            }
        }

        let cards = [];
        for (let r of topReciters) {
            const imageMessage = await createHeaderImage(r.name);
            const serverUrl = r.moshaf[0]?.server;
            const moshafId = r.moshaf[0]?.id;

            // Description based on moshaf type
            const moshafName = r.moshaf[0]?.name || "مصحف";

            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `👤 *القارئ:* ${r.name}\n📖 *الرواية:* ${moshafName}\n🔢 *عدد السور:* ${r.moshaf[0]?.surah_total || '114'}`
                }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({
                    text: `乂 ${settings.botName} ☪️`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: "القرآن الكريم",
                    hasMediaAttachment: true,
                    imageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [
                        {
                            "name": "quick_reply",
                            "buttonParamsJson": JSON.stringify({
                                display_text: "📜 قائمة السور",
                                id: `${settings.prefix}quransurah ${r.id}`
                            })
                        },
                        {
                            "name": "quick_reply",
                            "buttonParamsJson": JSON.stringify({
                                display_text: "📖 سورة البقرة",
                                id: `${settings.prefix}qdl ${r.id} 002`
                            })
                        }
                    ]
                })
            });
        }

        const title = userLang === 'ma' ? "🕌 *إختر القارئ المفضل عندك*" : "🕌 *اختر قارئك المفضل*";
        const subtitle = query ? `🔍 *نتائج البحث لـ:* ${query}` : "✨ *أشهر القراء*";

        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `${title}\n${subtitle}` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `© ${settings.botName}` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error('Error in quranmp3:', e);
        await sock.sendMessage(chatId, { text: t('common.error', {}, userLang) }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
}

quranMp3Command.command = ['quranmp3', 'القرآن', 'قراء'];
quranMp3Command.tags = ['islamic'];
quranMp3Command.desc = 'البحث عن قراء القرآن والاستماع MP3';

module.exports = quranMp3Command;
