const axios = require('axios');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const AES_KEY = 'ai-enhancer-web__aes-key';
const AES_IV = 'aienhancer-aesiv';

// Encrypt settings payload
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

// Core AI Enhancer function
async function bananaAI(imageBuffer, prompt) {
    const imgBase64 = imageBuffer.toString('base64');

    const settings = encryptSettings({
        prompt,
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        max_images: 1,
        sequential_image_generation: 'disabled'
    });

    const create = await axios.post(
        'https://aienhancer.ai/api/v1/r/image-enhance/create',
        {
            model: 2,
            function: "image-enhance",
            image: `data:image/jpeg;base64,${imgBase64}`,
            settings
        },
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
                'Content-Type': 'application/json',
                Origin: 'https://aienhancer.ai',
                Referer: 'https://aienhancer.ai/ai-image-editor'
            }
        }
    );

    if (!create.data?.data?.id) {
        throw new Error(create.data?.message || "Failed to create task");
    }

    const taskId = create.data.data.id;

    // Poll result
    for (let i = 0; i < 30; i++) {
        const result = await axios.post(
            'https://aienhancer.ai/api/v1/r/image-enhance/result',
            { task_id: taskId },
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
                    'Content-Type': 'application/json',
                    Origin: 'https://aienhancer.ai',
                    Referer: 'https://aienhancer.ai/ai-image-editor'
                }
            }
        );

        if (result.data.data.status === 'succeeded') {
            return result.data.data.output;
        }

        if (result.data.data.status === 'failed') {
            throw new Error("Processing failed on server");
        }

        await new Promise(res => setTimeout(res, 3000));
    }
    throw new Error("Processing timeout");
}

async function bananaAiCommand(sock, chatId, msg, args, commands, userLang, match) {
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
        return sock.sendMessage(chatId, {
            text: '❌ You must reply to an image.\n\nExample:\nReply to image → .banana-ai improve image quality'
        }, { quoted: msg });
    }

    if (!match) {
        return sock.sendMessage(chatId, {
            text: '❌ Please provide a prompt.\n\nExample:\n.banana-ai make the face clearer'
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: '🍌 Banana AI is enhancing your image...\nPlease wait ⏳' }, { quoted: msg });

    try {
        const buffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) throw new Error("Failed to download image");

        const resultUrl = await bananaAI(buffer, match);

        await sock.sendMessage(
            chatId,
            {
                image: { url: resultUrl },
                caption: '✅ Banana AI enhancement completed!'
            },
            { quoted: msg }
        );
    } catch (e) {
        console.error('banana-ai error:', e);
        sock.sendMessage(chatId, { text: '❌ Failed to process image. ' + (e.message || "") }, { quoted: msg });
    }
}

module.exports = bananaAiCommand;
