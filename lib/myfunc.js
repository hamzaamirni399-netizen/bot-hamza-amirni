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
        m.msg = (m.mtype == 'viewOnceMessage' || m.mtype == 'viewOnceMessageV2') ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype]
        m.body = m.message.conversation || m.msg.caption || m.msg.text || 
                 (m.mtype == 'listResponseMessage') && m.msg.singleSelectReply.selectedRowId || 
                 (m.mtype == 'buttonsResponseMessage') && m.msg.selectedButtonId || 
                 (m.mtype == 'viewOnceMessage') && m.msg.caption || 
                 (m.mtype == 'interactiveResponseMessage') && (JSON.parse(m.msg.nativeFlowResponseMessage?.paramsJson || '{}').id) || 
                 (m.mtype == 'templateButtonReplyMessage') && m.msg.selectedId || m.text

        // Robust Interactive Response Extraction
        if (m.mtype === 'interactiveResponseMessage') {
            const paramsJson = m.msg.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                try {
                    const params = JSON.parse(paramsJson);
                    if (params.id) m.body = params.id;
                } catch (e) { }
            }
        }
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
    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || m.body || ''

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
