const axios = require('axios');
const settings = require('../settings');

/**
 * تحميل سورة قرآنية بصيغة MP3
 */
async function qdlCommand(sock, chatId, msg, args, commands, userLang) {
    const reciterId = args[0];
    let surahNumber = args[1];

    if (!reciterId || !surahNumber) return;

    // Pad surah number to 3 digits (e.g. 1 -> 001)
    surahNumber = surahNumber.padStart(3, '0');

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    // Send loading message
    const loadingMsg = await sock.sendMessage(chatId, {
        text: "⏳ جاري تحميل السورة...\n⏳ Loading Surah..."
    }, { quoted: msg });

    try {
        const response = await axios.get(`https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`, { timeout: 30000 });
        const reciter = response.data.reciters[0];

        if (!reciter) throw new Error("Reciter not found");

        const serverUrl = reciter.moshaf[0].server;
        const audioUrl = `${serverUrl}${surahNumber}.mp3`;

        const surahNames = [
            "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
            "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
            "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
            "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
            "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
            "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
            "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
            "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
            "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
            "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
            "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
            "المسد", "الإخلاص", "الفلق", "الناس"
        ];

        const sName = surahNames[parseInt(surahNumber) - 1] || "سورة";

        // Delete loading message
        try {
            await sock.sendMessage(chatId, { delete: loadingMsg.key });
        } catch (e) { }

        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `${reciter.name} - ${sName}.mp3`,
            ptt: false,
            contextInfo: {
                externalAdReply: {
                    title: `📖 ${sName}`,
                    body: `القارئ: ${reciter.name}`,
                    mediaType: 2,
                    thumbnailUrl: "https://telegra.ph/file/ed156b8207f2ef84fbf8d.jpg"
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error('Error in qdl:', e);

        // Delete loading message
        try {
            await sock.sendMessage(chatId, { delete: loadingMsg.key });
        } catch (err) { }

        await sock.sendMessage(chatId, {
            text: "❌ فشل تحميل السورة. تأكد من أن السورة متوفرة لهذا القارئ.\n❌ Failed to download. Please verify the Surah is available for this reciter."
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
}

qdlCommand.command = ['qdl'];
module.exports = qdlCommand;
