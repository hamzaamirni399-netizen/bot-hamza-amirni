
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const { tmpdir } = require('os');
const fs = require('fs');
const ff = require('fluent-ffmpeg');
const webp = require('node-webpmux');

/**
 * Fetch buffer from URL with optimized headers
 * @param {string} url 
 * @param {object} options 
 */
async function fetchBuffer(url, options = {}) {
    try {
        const res = await axios({
            method: "GET",
            url,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.70 Safari/537.36",
                'DNT': 1,
                'Upgrade-Insecure-Requests': 1
            },
            ...options,
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (err) {
        throw err;
    }
}

/**
 * Fetch JSON from URL
 * @param {string} url 
 * @param {object} options 
 */
async function fetchJson(url, options = {}) {
    try {
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        });
        return res.data;
    } catch (err) {
        throw err;
    }
}

/**
 * Optimized sleep function
 * @param {number} ms 
 */
const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Get random item from array
 * @param {array} list 
 */
function getRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Format bytes to readable size
 * @param {number} bytes 
 * @param {boolean} si 
 */
function formatSize(bytes, si = true) {
    const thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) return bytes + ' B';
    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** 2;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
    return bytes.toFixed(2) + ' ' + units[u];
}

const { proto, getContentType, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');

/**
 * Serialize Message
 * @param {object} conn 
 * @param {object} m 
 * @param {object} store 
 */
function smsg(conn, m, store) {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = conn.decodeJid(m.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup) m.participant = conn.decodeJid(m.key.participant) || ''
    }
    if (m.message) {
        m.mtype = getContentType(m.message)

        // 1. Ultra-Robust Unwrapping (Recursively reach the core message)
        let coreMessage = m.message;
        while (['viewOnceMessage', 'viewOnceMessageV2', 'ephemeralMessage', 'documentWithCaptionMessage'].includes(m.mtype)) {
            coreMessage = coreMessage[m.mtype].message || coreMessage[m.mtype].message?.[getContentType(coreMessage[m.mtype].message)] || coreMessage[m.mtype];
            m.mtype = getContentType(coreMessage);
        }
        m.message = coreMessage;
        m.msg = m.message[m.mtype] || m.message;

        // 2. ULTRA-ROBUST ID/TEXT EXTRACTION
        let extractedId = '';
        const searchForCommand = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 10) return;

            // Priority Keys (Common in button responses)
            const pKeys = ['selectedId', 'selectedButtonId', 'selectedRowId', 'id', 'nativeFlowResponseMessage'];

            for (const k of pKeys) {
                const val = obj[k];
                if (typeof val === 'string' && (val.startsWith('.') || val.startsWith('!') || val.startsWith('/'))) {
                    extractedId = val;
                    return;
                }
                // Handle nested Native Flow JSON
                if (k === 'nativeFlowResponseMessage' && val?.paramsJson) {
                    try {
                        const parsed = JSON.parse(val.paramsJson);
                        if (parsed.id) { extractedId = parsed.id; return; }
                    } catch (e) { }
                }
            }

            // Recursive traversal for deeper nesting
            for (const key in obj) {
                if (!extractedId && typeof obj[key] === 'object') searchForCommand(obj[key], depth + 1);
                if (extractedId) return;
            }
        };

        searchForCommand(m.message);

        // 3. Populate m.body and m.text with Priority
        m.body = extractedId || m.message.conversation || m.msg?.caption || m.msg?.text || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || m.msg?.selectedId || '';

        // 🚨 DEBUG: Dump for Button Responses if no prefix found
        if ((m.mtype.includes('Response') || m.mtype.includes('Reply') || m.mtype.includes('template')) && !m.body.startsWith('.')) {
            console.log(`[smsg-debug] 🔘 Button Response Detected! Type: ${m.mtype} | Raw Body: "${m.body}"`);
            console.log(`[smsg-debug] 📦 Core Message Dump: ${JSON.stringify(coreMessage).slice(0, 500)}...`);

            // HARDER FALLBACK: Search for prefix anywhere in the dump
            const fullDump = JSON.stringify(coreMessage);
            const match = fullDump.match(/\"(\.[a-z0-9_]+[^\"]*)\"/i);
            if (match && match[1]) {
                console.log(`[smsg-debug] ✅ Deep Scan found ID: "${match[1]}"`);
                m.body = match[1];
            }
        }

        // 🚨 LABEL-BASED FALLBACK (Guaranteed for Menu)
        if (!m.body.startsWith('.')) {
            const cleanBody = m.body.toLowerCase();
            if (cleanBody.includes('developer') || cleanBody.includes('المطور')) m.body = '.owner';
            else if (cleanBody.includes('menu') || cleanBody.includes('قائمة') || cleanBody.includes('مساعدة')) m.body = '.help';
            else if (cleanBody.includes('download') || cleanBody.includes('تحميل')) {
                // If it's a download label but ID is lost, we're in trouble unless we find context.
                // This usually happens when ID is replaced by label.
            }
        }

        m.text = m.body;
        let quoted = m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null
        m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
        if (m.quoted) {
            let type = getContentType(quoted)
            m.quoted = m.quoted[type]
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted)
                m.quoted = m.quoted[type]
            }
            if (typeof m.quoted === 'string') m.quoted = {
                text: m.quoted
            }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
            m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === (conn.user && conn.user.id)
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
            m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                let q = await store.loadMessage(m.chat, m.quoted.id, conn)
                return smsg(conn, q, store)
            }
            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })

            // Add download method to quoted
            m.quoted.download = () => downloadMediaMessage(vM, 'buffer', {}, { logger: console })
        }
    }
    m.download = () => downloadMediaMessage(m, 'buffer', {}, { logger: console })
    m.text = m.body;

    return m
}

module.exports = {
    fetchJson,
    fetchBuffer,
    sleep,
    getRandom,
    formatSize,
    smsg
};
