const axios = require('axios');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');
const { getSurahNumber } = require('../lib/quranUtils');
const fs = require('fs');
const path = require('path');

const surahList = [
    { number: 1, name: "الفاتحة" }, { number: 2, name: "البقرة" }, { number: 3, name: "آل عمران" }, { number: 4, name: "النساء" },
    { number: 5, name: "المائدة" }, { number: 6, name: "الأنعام" }, { number: 7, name: "الأعراف" }, { number: 8, name: "الأنفال" },
    { number: 9, name: "التوبة" }, { number: 10, name: "يونس" }, { number: 11, name: "هود" }, { number: 12, name: "يوسف" },
    { number: 13, name: "الرعد" }, { number: 14, name: "إبراهيم" }, { number: 15, name: "الحجر" }, { number: 16, name: "النحل" },
    { number: 17, name: "الإسراء" }, { number: 18, name: "الكهف" }, { number: 19, name: "مريم" }, { number: 20, name: "طه" },
    { number: 21, name: "الأنبياء" }, { number: 22, name: "الحج" }, { number: 23, name: "المؤمنون" }, { number: 24, name: "النور" },
    { number: 25, name: "الفرقان" }, { number: 26, name: "الشعراء" }, { number: 27, name: "النمل" }, { number: 28, name: "القصص" },
    { number: 29, name: "العنكبوت" }, { number: 30, name: "الروم" }, { number: 31, name: "لقمان" }, { number: 32, name: "السجدة" },
    { number: 33, name: "الأحزاب" }, { number: 34, name: "سبأ" }, { number: 35, name: "فاطر" }, { number: 36, name: "يس" },
    { number: 37, name: "الصافات" }, { number: 38, name: "ص" }, { number: 39, name: "الزمر" }, { number: 40, name: "غافر" },
    { number: 41, name: "فصلت" }, { number: 42, name: "الشورى" }, { number: 43, name: "الزخرف" }, { number: 44, name: "الدخان" },
    { number: 45, name: "الجاثية" }, { number: 46, name: "الأحقاف" }, { number: 47, name: "محمد" }, { number: 48, name: "الفتح" },
    { number: 49, name: "الحجرات" }, { number: 50, name: "ق" }, { number: 51, name: "الذاريات" }, { number: 52, name: "الطور" },
    { number: 53, name: "النجم" }, { number: 54, name: "القمر" }, { number: 55, name: "الرحمن" }, { number: 56, name: "الواقعة" },
    { number: 57, name: "الحديد" }, { number: 58, name: "المجادلة" }, { number: 59, name: "الحشر" }, { number: 60, name: "الممتحنة" },
    { number: 61, name: "الصف" }, { number: 62, name: "الجمعة" }, { number: 63, name: "المنافقون" }, { number: 64, name: "التغابن" },
    { number: 65, name: "الطلاق" }, { number: 66, name: "التحريم" }, { number: 67, name: "الملك" }, { number: 68, name: "القلم" },
    { number: 69, name: "الحاقة" }, { number: 70, name: "المعارج" }, { number: 71, name: "نوح" }, { number: 72, name: "الجن" },
    { number: 73, name: "المزمل" }, { number: 74, name: "المدثر" }, { number: 75, name: "القيامة" }, { number: 76, name: "الإنسان" },
    { number: 77, name: "المرسلات" }, { number: 78, name: "النبأ" }, { number: 79, name: "النازعات" }, { number: 80, name: "عبس" },
    { number: 81, name: "التكوير" }, { number: 82, name: "الانفطار" }, { number: 83, name: "المطففين" }, { number: 84, name: "الانشقاق" },
    { number: 85, name: "البروج" }, { number: 86, name: "الطارق" }, { number: 87, name: "الأعلى" }, { number: 88, name: "الغاشية" },
    { number: 89, name: "الفجر" }, { number: 90, name: "البلد" }, { number: 91, name: "الشمس" }, { number: 92, name: "الليل" },
    { number: 93, name: "الضحى" }, { number: 94, name: "الشرح" }, { number: 95, name: "التين" }, { number: 96, name: "العلق" },
    { number: 97, name: "القدر" }, { number: 98, name: "البينة" }, { number: 99, name: "الزلزلة" }, { number: 100, name: "العاديات" },
    { number: 101, name: "القارعة" }, { number: 102, name: "التكاثر" }, { number: 103, name: "العصر" }, { number: 104, name: "الهمزة" },
    { number: 105, name: "الفيل" }, { number: 106, name: "قريش" }, { number: 107, name: "الماعون" }, { number: 108, name: "الكوثر" },
    { number: 109, name: "الكافرون" }, { number: 110, name: "النصر" }, { number: 111, name: "المسد" }, { number: 112, name: "الإخلاص" },
    { number: 113, name: "الفلق" }, { number: 114, name: "الناس" }
];

async function quranMp3Command(sock, chatId, msg, args, commands, userLang) {
    let query = args.join(' ').trim();
    const isAudioRequest = query.includes('--audio');

    // Clean query if internal flag is present
    if (isAudioRequest) {
        query = query.replace('--audio', '').trim();
    }

    await sock.sendMessage(chatId, { react: { text: "🕌", key: msg.key } });

    // 1. Check if it's a Surah Request (and NOT already an audio specific request)
    // If user typed: ".quran fatiha" -> Detects Surah 1 -> Shows Format Card
    // If user clicked "Audio" on Format Card -> Command became ".quranmp3 fatiha --audio" -> Detects Surah 1 but isAudioRequest is true -> Skips to reciters

    const directSurahId = getSurahNumber(query);

    if (directSurahId && !isAudioRequest) {
        return showSurahOptions(sock, chatId, msg, directSurahId);
    }

    // Also handle case where query is empty (Main Menu)
    if (!query) {
        // Just show general menu or maybe default to Reciter list?
        // User asked for "quran brito ywli hta quranmp3 nfs lhaja" (same as quranmp3).
        // Since .quran is alias to .quranmp3, if no args, we usually show popular reciters.
        // But maybe we should show a General Choice Card?
        // Let's stick to showing popular reciters OR a helper message. 
        // Given user wants "add to card choose audio/text/pdf", this implies when they WANT a surah.
        // So for empty query, we proceed to Popular Reciters as usual (Carousel of reciters).
    }

    // 2. Reciter Logic (Existing/Refined for Audio)
    try {
        const response = await axios.get('https://mp3quran.net/api/v3/reciters?language=ar', { timeout: 10000 });
        let reciters = response.data.reciters;
        if (!reciters) throw new Error("No data");

        let targetSurahId = null;
        let reciterQuery = "";

        // If we entered here with directSurahId (because isAudioRequest is true), set target
        if (directSurahId) {
            targetSurahId = directSurahId;
        } else if (args.length > 1) {
            const firstArgSurahId = getSurahNumber(args[0]);
            if (firstArgSurahId) {
                targetSurahId = firstArgSurahId;
                reciterQuery = args.slice(1).join(" ").replace('--audio', '').trim();
            }
        }

        // Filter
        if (reciterQuery) {
            reciters = reciters.filter(r => r.name.toLowerCase().includes(reciterQuery.toLowerCase()));
        } else if (!targetSurahId && query) {
            // Check if query isn't just the surah name (which we already handled or isAudioRequest handled)
            reciters = reciters.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
        } else {
            // Popular
            const popularNames = ['مشاري العفاسي', 'عبد الباسط عبد الصمد', 'ماهر المعيقلي', 'سعود الشريم', 'ياسر الدوسري', 'أحمد العجمي', 'سعد الغامدي', 'فارس عباد', 'منشاوي', 'الحصري', 'إسلام صبحي', 'هزاع البلوشي'];
            reciters = reciters.filter(r => popularNames.some(p => r.name.includes(p))).slice(0, 12);
        }

        if (!reciters.length) {
            return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على قارئ." }, { quoted: msg });
        }

        const topReciters = reciters.slice(0, 10);

        // Helper for Image
        async function createHeaderImage() {
            try {
                const imageUrl = 'https://images.unsplash.com/photo-1597933534024-161304f4407b?q=80&w=1000&auto=format&fit=crop';
                const { imageMessage } = await generateWAMessageContent({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
                return imageMessage;
            } catch (e) { return null; }
        }
        const sharedImageMessage = await createHeaderImage();

        const cards = topReciters.map(r => {
            const moshafName = r.moshaf[0]?.name || "مصحف";
            const buttons = targetSurahId ?
                [
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: `🎧 تحميل MP3`,
                            id: `${settings.prefix}qdl ${r.id} ${targetSurahId}`
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: `📄 ملف (PDF)`,
                            url: `https://quran.com/${targetSurahId}`
                        })
                    },
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: `📖 قراءة (Text)`,
                            id: `${settings.prefix}quranread ${targetSurahId}`
                        })
                    }
                ] :
                [{
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: "📜 قائمة السور", id: `${settings.prefix}quransurah ${r.id}` })
                }, {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: "🎧 سورة البقرة", id: `${settings.prefix}qdl ${r.id} 002` })
                }];

            return {
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `👤 *القارئ:* ${r.name}\n📖 *الرواية:* ${moshafName}\n🔢 *عدد السور:* ${r.moshaf[0]?.surah_total || '114'}`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: r.name,
                    hasMediaAttachment: !!sharedImageMessage, // Only true if image exists
                    imageMessage: sharedImageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons })
            };
        });

        const title = targetSurahId ? `🎧 *اختر القارئ لسورة ${targetSurahId}*` : "🕌 *قائمة القراء*";
        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: title }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("QuranMP3 Error:", e);
        await sock.sendMessage(chatId, { text: "❌ Error fetching reciters." }, { quoted: msg });
    }
}

// 🆕 Function to show Surah Options (Format Card)
async function showSurahOptions(sock, chatId, msg, surahId) {
    const surahNameObj = surahList.find(s => s.number == parseInt(surahId));
    const surahName = surahNameObj ? surahNameObj.name : `Surah ${surahId}`;

    const imageUrl = 'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?q=80&w=1000&auto=format&fit=crop';
    let imageMessage = null;
    try {
        const gen = await generateWAMessageContent({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
        imageMessage = gen.imageMessage;
    } catch (e) { }

    const card = {
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: `📖 *سورة ${surahName}*\n\nكيف تريد عرض هذه السورة؟\n\n🎧 *صوت:* استماع وتحميل (MP3)\n📖 *قراءة:* نص مكتوب\n📄 *ملف:* تحميل كملف (Document)`
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: `سورة ${surahName}`,
            hasMediaAttachment: !!imageMessage,
            imageMessage: imageMessage
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "🎧 استماع (Audio)",
                        id: `${settings.prefix}quranmp3 ${surahId} --audio`
                    })
                },
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "📖 قراءة (Text)",
                        id: `${settings.prefix}quranread ${surahId}`
                    })
                },
                {
                    "name": "cta_url",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "📄 ملف (Official Site)",
                        url: `https://quran.com/${surahId}`
                    })
                }
            ]
        })
    };

    const botMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: "✨ *خيارات العرض*" }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards: [card] })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
    await sock.sendMessage(chatId, { react: { text: "✨", key: msg.key } });
}

quranMp3Command.command = ['quranmp3', 'القرآن', 'قراء'];
quranMp3Command.tags = ['islamic'];
quranMp3Command.desc = 'البحث عن قراء القرآن والاستماع MP3';

module.exports = quranMp3Command;
