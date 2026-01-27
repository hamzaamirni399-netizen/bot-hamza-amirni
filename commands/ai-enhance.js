const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

class PhotoEnhancer {
    constructor() {
        this.cfg = {
            base: "https://photoenhancer.pro",
            end: {
                enhance: "/api/enhance",
                status: "/api/status",
                removeBg: "/api/remove-background",
                upscale: "/api/upscale"
            },
            headers: {
                accept: "*/*",
                "content-type": "application/json",
                origin: "https://photoenhancer.pro",
                referer: "https://photoenhancer.pro/",
                "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Mobile"
            }
        };
    }

    wait(ms) {
        return new Promise(r => setTimeout(r, ms || 3000));
    }

    async poll(id) {
        for (let i = 0; i < 60; i++) {
            await this.wait();
            const { data } = await axios.get(
                `${this.cfg.base}${this.cfg.end.status}`,
                {
                    params: { id },
                    headers: this.cfg.headers
                }
            );
            if (data?.status === "succeeded") return data;
            if (data?.status === "failed") throw new Error("Processing failed");
        }
        throw new Error("Processing timeout");
    }

    async generate({ imageBase64, type }) {
        let endpoint = this.cfg.end.enhance;
        let body = { imageData: imageBase64, mode: "ultra", fileName: "image.png" };

        if (type === "remove-bg") {
            endpoint = this.cfg.end.removeBg;
            body = { imageData: imageBase64 };
        }

        if (type === "upscale") {
            endpoint = this.cfg.end.upscale;
            body = { imageData: imageBase64, targetResolution: "4K" };
        }

        const init = await axios.post(
            `${this.cfg.base}${endpoint}`,
            body,
            { headers: this.cfg.headers }
        );

        if (init.data?.predictionId) {
            const final = await this.poll(init.data.predictionId);
            return final.resultUrl;
        }

        return init.data?.resultUrl;
    }
}

async function aiEnhanceCommand(sock, chatId, msg, args, commands, userLang, match) {
    let targetMessage = msg;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = msg.message.extendedTextMessage.contextInfo;
        targetMessage = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }

    const isImage = targetMessage.message?.imageMessage;

    if (!isImage) {
        const usageText = `❌ *AI Enhance - Usage Guide*

You must reply to an image to use this feature.

📌 *How to use:*
1. Send or receive an image
2. Reply to the image
3. Type one of the commands below

✨ *Available Commands*
• .ai-enhance → Enhance image quality
• .ai-enhance bg → Remove background
• .ai-enhance upscale → Upscale image to 4K

📝 *Example*
Reply to an image and type:
.ai-enhance

⚠️ Notes:
• Processing takes 5–15 seconds
`;
        return sock.sendMessage(chatId, { text: usageText }, { quoted: msg });
    }

    try {
        const text = match.toLowerCase();
        let type = "enhance";

        if (text.includes("bg")) type = "remove-bg";
        if (text.includes("upscale")) type = "upscale";

        await sock.sendMessage(chatId, { text: "⏳ *AI is processing your image, please wait...*" }, { quoted: msg });

        const buffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) throw new Error("Failed to download image");

        const imageBase64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;

        const api = new PhotoEnhancer();
        const result = await api.generate({
            imageBase64,
            type
        });

        if (!result) throw new Error("Failed to process image.");

        await sock.sendMessage(
            chatId,
            {
                image: { url: result },
                caption: "✅ *AI Enhance completed!*"
            },
            { quoted: msg }
        );

    } catch (e) {
        console.error('ai-enhance error:', e);
        await sock.sendMessage(chatId, { text: "❌ Failed to process image. " + (e.message || "") }, { quoted: msg });
    }
}

module.exports = aiEnhanceCommand;
