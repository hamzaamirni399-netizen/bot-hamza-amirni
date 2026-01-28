const { sendWithChannelButton } = require('../lib/channelButton');
const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');
const { setSession } = require('../lib/quranSession');

async function quranReadCommand(sock, chatId, message, args, commands, userLang) {
    try {
        const surahNumber = args[0];

        if (!surahNumber) {
            await sendWithChannelButton(sock, chatId, t('quran.enter_number', {}, userLang), message);
            return;
        }

        const apiUrl = `https://api.alquran.cloud/v1/surah/${surahNumber}`;
        const response = await axios.get(apiUrl);
        if (!response.data || response.data.status !== 'OK') {
            await sendWithChannelButton(sock, chatId, t('quran.fetch_error', {}, userLang), message);
            return;
        }

        const surah = response.data.data;
        const name = surah.name;
        const englishName = surah.englishName;
        const ayahs = surah.ayahs || [];

        let textParts = [];
        textParts.push(t('quran.surah_info', { name, englishName, length: ayahs.length }, userLang));
        textParts.push('━━━━━━━━━━━━━━━━━━━━');

        const ayahsPerPage = 30;
        const maxAyahs = Math.min(ayahs.length, ayahsPerPage);

        for (let i = 0; i < maxAyahs; i++) {
            const a = ayahs[i];
            textParts.push(`${a.numberInSurah}. ${a.text}`);
        }

        if (ayahs.length > maxAyahs) {
            textParts.push('\n━━━━━━━━━━━━━━━━━━━━');
            textParts.push(t('quran.hidden_ayahs', {}, userLang));
            textParts.push(t('quran.continue_tip', { prefix: settings.prefix }, userLang));

            // Save session for .continue
            setSession(chatId, {
                surahNumber,
                name,
                englishName,
                lastIndex: maxAyahs,
                totalAyahs: ayahs.length
            });
        }

        const caption = textParts.join('\n');
        await sendWithChannelButton(sock, chatId, caption, message);

    } catch (error) {
        console.error('Error in quranread command:', error);
        await sendWithChannelButton(sock, chatId, t('quran.error', {}, userLang), message);
    }
}

module.exports = quranReadCommand;
