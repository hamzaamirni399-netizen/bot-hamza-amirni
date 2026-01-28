const axios = require("axios");
const settings = require("../settings");
const { t } = require("../lib/language");
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

function getWeatherEmoji(weather) {
    const map = {
        Thunderstorm: "⛈️",
        Drizzle: "🌦️",
        Rain: "🌧️",
        Snow: "❄️",
        Mist: "🌫️",
        Smoke: "💨",
        Haze: "🌫️",
        Dust: "🌪️",
        Fog: "🌫️",
        Sand: "🏜️",
        Ash: "🌋",
        Squall: "💨",
        Tornado: "🌪️",
        Clear: "☀️",
        Clouds: "☁️"
    };
    return map[weather] || "🌍";
}

module.exports = async function weatherCommand(sock, chatId, msg, args) {
    try {
        const city = args.join(' ').trim();

        if (!city) {
            return await sock.sendMessage(chatId, { text: t('weather.help', { prefix: settings.prefix }) }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: "☁️", key: msg.key } });

        const apiUrl = `https://apis.davidcyriltech.my.id/weather?city=${encodeURIComponent(city)}`;
        const response = await axios.get(apiUrl);
        const w = response.data;

        if (!w.success || !w.data) {
            return await sock.sendMessage(chatId, { text: t('weather.not_found', { city }) }, { quoted: msg });
        }

        const d = w.data;
        const emoji = getWeatherEmoji(d.weather);

        const weatherBody = t('weather.result', {
            location: d.location,
            country: d.country,
            temp: d.temperature,
            feels_like: d.feels_like,
            val_emoji: emoji,
            desc: d.description,
            humidity: d.humidity,
            wind: d.wind_speed,
            pressure: d.pressure,
            time: new Date().toLocaleTimeString('ar-MA')
        });

        const weatherImages = [
            "https://images.unsplash.com/photo-1592210633464-a7db0536f0f9?q=80&w=1000&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?q=80&w=1000&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1530908295418-a12e326966ba?q=80&w=1000&auto=format&fit=crop"
        ];
        const randomWeatherImg = weatherImages[Math.floor(Math.random() * weatherImages.length)];

        const genImage = await generateWAMessageContent(
            { image: { url: randomWeatherImg } },
            { upload: sock.waUploadToServer }
        );

        const card = {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: weatherBody
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: `乂 ${settings.botName} 🌍`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `حالة الطقس في ${d.location}`,
                hasMediaAttachment: true,
                imageMessage: genImage.imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({ display_text: "تحديث 🔄", id: `${settings.prefix}weather ${city}` })
                    }
                ]
            })
        };

        const interactiveMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: weatherBody }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName} 🌍` }),
                        header: proto.Message.InteractiveMessage.Header.create({ title: `حالة الطقس في ${d.location}`, hasMediaAttachment: true, imageMessage: genImage.imageMessage }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [
                                {
                                    "name": "quick_reply",
                                    "buttonParamsJson": JSON.stringify({ display_text: "تحديث 🔄", id: `${settings.prefix}weather ${city}` })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, interactiveMsg.message, { messageId: interactiveMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error("Weather Error:", error);
        await sock.sendMessage(chatId, { text: "❌ حدث خطأ أثناء جلب الطقس." }, { quoted: msg });
    }
};
