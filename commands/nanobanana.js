/**
   • الميزة: تعديل الصور بالذكاء الاصطناعي - نانو بنانا
   • المطور: حمزة اعمرني (𝐇𝐀𝐌𝐙𝐀 𝐀𝐌𝐈𝐑𝐍𝐈)
   • القناة: https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p
**/

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");

const AES_KEY = "ai-enhancer-web__aes-key";
const AES_IV = "aienhancer-aesiv";

function encryptSettings(obj) {
    return CryptoJS.AES.encrypt(
        JSON.stringify(obj),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        {
            iv: CryptoJS.enc.Utf8.parse(AES_IV),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    ).toString();
}

async function processImageAI(filePath, prompt) {
    try {
        const img = fs.readFileSync(filePath, "base64");

        const settings = encryptSettings({
            prompt,
            size: "2K",
            aspect_ratio: "match_input_image",
            output_format: "jpeg",
            max_images: 1
        });

        const headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            "Content-Type": "application/json",
            Origin: "https://aienhancer.ai",
            Referer: "https://aienhancer.ai/ai-image-editor"
        };

        const create = await axios.post(
            "https://aienhancer.ai/api/v1/r/image-enhance/create",
            {
                model: 2,
                function: "image-edit",
                image: `data:image/jpeg;base64,${img}`,
                settings
            },
            { headers }
        );

        const id = create?.data?.data?.id;
        if (!id) throw new Error("لم يتم العثور على معرف المهمة");

        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 3000));

            const r = await axios.post(
                "https://aienhancer.ai/api/v1/k/image-enhance/result",
                { task_id: id },
                { headers }
            );

            const data = r?.data?.data;
            if (!data) continue;

            if (data.status === "success") {
                return {
                    id,
                    output: data.output,
                    input: data.input
                };
            }

            if (data.status === "failed") {
                throw new Error(data.error || "فشلت العملية");
            }
        }

        throw new Error("استغرق الأمر وقتاً طويلاً جداً");

    } catch (e) {
        throw e;
    }
}

async function handler(sock, chatId, msg, args) {
    // Determine the target message (handle quoted)
    let targetMsg = msg;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = msg.message.extendedTextMessage.contextInfo;
        targetMsg = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }

    const mime = targetMsg.message?.imageMessage?.mimetype || "";

    if (!mime.startsWith("image/")) {
        const usedPrefix = global.settings?.prefix || ".";
        const command = args[0] || "نانو";
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*⚠️ يرجى إرسال أو الرد على صورة*\n\n*مثال:* ${usedPrefix}${command} تحويل الوجه إلى أنمي\n*✨ ──────────────── ✨*`
        }, { quoted: msg });
    }

    const text = args.join(" ");
    if (!text) {
        const usedPrefix = global.settings?.prefix || ".";
        const command = args[0] || "نانو";
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*📝 يرجى كتابة وصف التعديل*\n\n*مثال:* ${usedPrefix}${command} تغيير الملابس إلى بدلة رسمية\n*✨ ──────────────── ✨*`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        react: { text: "🕒", key: msg.key }
    });

    const waitMsg = await sock.sendMessage(chatId, { text: "🔄 جاري معالجة طلبك وتعديل الصورة بذكاء نانو... يرجى الانتظار." }, { quoted: msg });

    try {
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) throw new Error("فشل تحميل الصورة");

        const tmpDir = path.join(process.cwd(), "tmp");
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const filePath = path.join(tmpDir, `${Date.now()}.jpg`);
        fs.writeFileSync(filePath, buffer);

        const result = await processImageAI(filePath, text);

        await sock.sendMessage(chatId, { delete: waitMsg.key });

        const caption = `
*✨ ───❪ HAMZA AMIRNI ❫─── ✨*

✅ *تم تعديل الصورة بنجاح*

� *الوصف:* ${text}

*🚀 تـم الـتـولـيـد بـوسـاطـة نـانـو AI*
`.trim();

        await sock.sendMessage(
            chatId,
            {
                image: { url: result.output },
                caption: caption,
                contextInfo: {
                    externalAdReply: {
                        title: "Nano AI Image Editor",
                        body: "𝐇𝐀𝐌𝐙𝐀 𝐀𝐌𝐈𝐑𝐍𝐈",
                        thumbnailUrl: result.output,
                        sourceUrl: "https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            },
            { quoted: msg }
        );

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await sock.sendMessage(chatId, {
            react: { text: "✅", key: msg.key }
        });

    } catch (e) {
        console.error(e);
        if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*❌ فشل التعديل*\n\n📌 تأكد من أن الصورة واضحة والوصف مفهوم\n*✨ ──────────────── ✨*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, {
            react: { text: "❌", key: msg.key }
        });
    }
}

module.exports = handler;
