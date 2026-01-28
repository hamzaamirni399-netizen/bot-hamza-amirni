const { sendWithChannelButton } = require('../lib/channelButton');
const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');
const fs = require('fs');
const path = require('path');

// NOTE: Generating Arabic PDF in Node.js without specific fonts/reshapers is difficult.
// We will generate a clear Text File (.txt) which is universally readable and serves the "Document" purpose.
// Or we can try to find a direct PDF link. 

module.exports = async (sock, chatId, message, args, commands, userLang) => {
    try {
        const surahNumber = args[0];

        if (!surahNumber) {
            await sock.sendMessage(chatId, { text: "❌ Please provide a Surah number." }, { quoted: message });
            return;
        }

        // Fetch Surah Data
        const apiUrl = `https://api.alquran.cloud/v1/surah/${surahNumber}`;
        const response = await axios.get(apiUrl);

        if (!response.data || response.data.status !== 'OK') {
            await sock.sendMessage(chatId, { text: "❌ Failed to fetch Surah." }, { quoted: message });
            return;
        }

        const surah = response.data.data;
        const name = surah.name;
        const englishName = surah.englishName;
        const ayahs = surah.ayahs || [];

        await sock.sendMessage(chatId, { react: { text: "📄", key: message.key } });

        // Prepare Text Content
        let content = `
${name}
${englishName}
Total Ayahs: ${ayahs.length}
Revelation Type: ${surah.revelationType}
-----------------------------------------

`;
        // Add Basmalah if not At-Tawbah (1) but actually API usually includes it in first ayah text for some, 
        // but let's just dump the text provided.

        ayahs.forEach(a => {
            content += `[${a.numberInSurah}] ${a.text}\n\n`;
        });

        content += `
-----------------------------------------
${settings.botName}
`;

        // Save to temporary file
        const filename = `${surah.number}_${englishName.replace(/\s/g, '_')}.txt`; // Using .txt for best Arabic compatibility
        const tempDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, filename);

        fs.writeFileSync(filePath, content);

        // Send Document
        await sock.sendMessage(chatId, {
            document: { url: filePath },
            mimetype: 'text/plain', // Or application/pdf if we managed to make one
            fileName: filename,
            caption: `📄 *${name}* (${englishName})`
        }, { quoted: message });

        // Cleanup
        setTimeout(() => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 30000);

    } catch (error) {
        console.error('Error in quranpdf command:', error);
        await sock.sendMessage(chatId, { text: "❌ Error generating file." }, { quoted: message });
    }
};

// Metadata
module.exports.command = ['quranpdf'];
module.exports.tags = ['islamic'];
module.exports.desc = 'Download Surah as Document';
