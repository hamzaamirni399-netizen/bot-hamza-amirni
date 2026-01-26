const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { t, getUserLanguage } = require('./language');
const { isOwner } = require('./ownerCheck');
const { getBotMode } = require('../commands/mode');
const { Antilink } = require('./antilink');
const { handleBadwordDetection } = require('./antibadword');
const { sendWithChannelButton } = require('./channelButton');



// Load all command files
const commands = new Map();
const commandsPath = path.join(__dirname, '../commands');

// Simple Anti-Spam Map
const spamMap = new Map();
const SPAM_THRESHOLD = 4000; // 4 seconds between commands (Anti-Ban)

// Load commands from directory
fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
        const commandName = file.replace('.js', '');
        const commandPath = path.join(commandsPath, file);
        try {
            commands.set(commandName, require(commandPath));
        } catch (error) {
            console.error(`Error loading command ${commandName}:`, error);
        }
    }
});

console.log(`✅ Loaded ${commands.size} commands`);

const { addUser } = require('./userLogger');

// Main message handler
async function handleMessage(sock, msg) {
    try {
        // Debug: Log that we received a message
        console.log('[Handler] 📨 Message received from:', msg.key.remoteJid);

        const senderId = msg.key.participant || msg.key.remoteJid;

        // Register user automatically
        try {
            // Updated to use the senderId directly for logging
            addUser({ id: senderId, name: msg.pushName || '' });
        } catch (e) {
            console.error('[Handler] Error in addUser:', e);
        }
        const messageType = Object.keys(msg.message || {})[0];
        const chatId = msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        // Get message text using the serialized smsg fields for better reliability
        let messageText = (msg.text || msg.body || '').trim();

        // 🔍 DEBUG LOG: See what the bot "sees"
        if (messageText) {
             console.log(`[Handler] 📩 Final Text: "${messageText}" | Type: ${msg.mtype} | Chat: ${chatId}`);
        } else if (msg.mtype === 'interactiveResponseMessage' || msg.mtype === 'buttonsResponseMessage') {
             console.log(`[Handler] 🔘 EMPTY Button Response! (Type: ${msg.mtype})`);
        }

        // Check if message starts with prefix FIRST (before antilink)
        const isCommand = messageText.startsWith(settings.prefix);

        // --- LEVELING SYSTEM ---
        // --- LEVELING SYSTEM (DISABLED BY USER REQUEST) ---
        // try {
        //     const { addXp } = require('./leveling');
        //     // Give 10 XP per message (activity reward)
        //     const xpResult = addXp(senderId, 10);
        //
        //     if (xpResult.leveledUp) {
        //         const levelUpMsg = `🎉 *مبروك!* \n\n🆙 طلعتي لـ *Level ${xpResult.level}*\n💰 ربحتي مكافأة ديال الفلوس!`;
        //         await sock.sendMessage(chatId, { text: levelUpMsg }, { quoted: msg });
        //     }
        // } catch (e) {
        //     console.error('[Leveling] Error adding XP:', e);
        // }

        // Run Antilink and Antibadword checks for groups ONLY if it's NOT a command
        if (isGroup && !isCommand) {
            try {
                await Antilink(msg, sock);
                await handleBadwordDetection(sock, chatId, msg, messageText, senderId);
            } catch (e) {
                console.error('[Handler] Error in Group Protection hooks:', e);
            }
        }

        // --- GLOBAL FEATURES (Run on ALL messages) ---
        const isUserOwner = isOwner(msg);
        const { isBotAdmin } = require('./botAdmins');
        const isUserAdmin = isBotAdmin(senderId);

        // 🚀 MODE CHECK (Bypass for owner and bot admins)
        let currentMode = 'public';
        try {
            currentMode = getBotMode() || 'public';
        } catch (e) { }

        if (currentMode === 'self' && !isUserOwner && !isUserAdmin) {
            return; // Ignore all in Self mode if not owner/admin
        }

        if (currentMode === 'groups' && !isGroup && !isUserOwner && !isUserAdmin) {
            return; // Ignore all in Private if in Groups mode and not owner/admin
        }

        // 1. PM Blocker Logic (STRICT: Blocks everything in PM except owner/admin)
        if (!isGroup && !msg.key.fromMe && !isUserOwner && !isUserAdmin) {
            try {
                const { readState } = require('../commands/pmblocker');
                const pmState = readState();
                if (pmState.enabled) {
                    console.log(`[PM Blocker] Intercepted message from ${senderId}`);
                    const { sendWithChannelButton } = require('./channelButton');

                    // Send warning message
                    await sendWithChannelButton(sock, chatId, pmState.message, msg);

                    // Block user immediately
                    await sock.updateBlockStatus(chatId, 'block');
                    console.log(`[PM Blocker] ✅ Blocked user: ${senderId}`);
                    return; // Stop ALL further processing
                }
            } catch (e) {
                console.error('[PM Blocker] Error:', e);
            }
        }

        // 2. Auto-Read Logic
        try {
            const configPath = path.join(__dirname, '../data/config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath));
                if (config.AUTOREAD === "true") {
                    await sock.readMessages([msg.key]);
                }
            }
        } catch (e) { }

        // Check if message starts with prefix
        // 🚀 AUTO-DOWNLOAD LOGIC (No Prefix) 🚀
        if (!messageText.startsWith(settings.prefix)) {
            const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
            const links = messageText.match(urlRegex);

            if (links && links.length > 0) {
                const cleanText = links[0];
                let autoCommand = null;

                if (/(facebook\.com|fb\.watch|fb\.com)/i.test(cleanText)) {
                    autoCommand = 'facebook';
                } else if (/(youtube\.com|youtu\.be)/i.test(cleanText)) {
                    autoCommand = 'video';
                } else if (/(tiktok\.com)/i.test(cleanText)) {
                    autoCommand = 'tiktok';
                } else if (/(instagram\.com|threads\.net)/i.test(cleanText)) {
                    autoCommand = 'instagram';
                } else if (/(mediafire\.com)/i.test(cleanText)) {
                    autoCommand = 'mediafire';
                } else if (/(twitter\.com|x\.com)/i.test(cleanText)) {
                    autoCommand = 'twitter';
                } else if (/(pinterest\.com\/pin\/)/i.test(cleanText)) {
                    autoCommand = 'pinterestdl';
                } else if (/(capcut\.com)/i.test(cleanText)) {
                    autoCommand = 'capcut';
                } else if (/(reddit\.com)/i.test(cleanText)) {
                    autoCommand = 'reddit';
                } else if (/(likee\.video|likee\.com)/i.test(cleanText)) {
                    autoCommand = 'likee';
                } else if (/(snapchat\.com)/i.test(cleanText)) {
                    autoCommand = 'snapchat';
                } else if (/(aptoide\.com|uptodown\.com)/i.test(cleanText)) {
                    autoCommand = 'apk';
                }

                if (autoCommand) {
                    console.log(`[Auto-Downloader] Detected ${autoCommand} link from ${senderId}`);
                    const newText = `${settings.prefix}${autoCommand} ${cleanText}`;
                    messageText = newText;

                    if (msg.message.conversation) msg.message.conversation = newText;
                    else if (msg.message.extendedTextMessage) msg.message.extendedTextMessage.text = newText;
                }
            }
        }

        // 3. TicTacToe & Hangman Move Logic (No Prefix Required)
        try {
            const ttt = require('../commands/tictactoe');
            if (ttt && typeof ttt.handleMove === 'function') {
                const handled = await ttt.handleMove(sock, chatId, senderId, messageText.trim().toLowerCase());
                if (handled) return; // Stop if move was handled
            }

            const hangman = require('../commands/hangman');
            if (hangman && typeof hangman.handleMove === 'function') {
                const handled = await hangman.handleMove(sock, chatId, senderId, messageText.trim().toLowerCase());
                if (handled) return; // Stop if move was handled
            }
        } catch (e) {
            console.error('[Game Handler Error]:', e);
        }

        if (!messageText.startsWith(settings.prefix)) {
            // Check for PDF Session (Collecting Images)
            try {
                const pdfCommand = require('../commands/pdf');
                if (pdfCommand && typeof pdfCommand.handleSession === 'function') {
                    await pdfCommand.handleSession(sock, msg, senderId);
                }
            } catch (e) { }

            // Check for APK Session (Numeric Choice)
            try {
                const apk2 = require('../commands/apk2');
                if (apk2 && typeof apk2.handleSession === 'function') {
                    // Force get userLang for the session handler
                    let slang = 'ar';
                    try { slang = await getUserLanguage(senderId); } catch (e) { }

                    const handled = await apk2.handleSession(sock, chatId, senderId, messageText.trim(), msg, slang);
                    if (handled) return; // Stop if selection was handled
                }
            } catch (e) { }

            // 🆕 UNIVERSAL NUMERIC LANGUAGE SELECTION (Moved here to avoid taking priority over APK choice)
            const cleanMsg = messageText.trim();
            if (cleanMsg === '1' || cleanMsg === '2' || cleanMsg === '3') {
                const langMap = { '1': 'en', '2': 'ar', '3': 'ma' };
                const selectedLang = langMap[cleanMsg];

                const { setUserLanguage } = require('./userLogger');
                setUserLanguage(senderId, selectedLang);

                const confirmMsg = selectedLang === 'en'
                    ? `✅ Language set to English!\n\nType *.menu* to see all commands.`
                    : selectedLang === 'ar'
                        ? `✅ تم تعيين اللغة إلى العربية!\n\nاكتب *.menu* لعرض جميع الأوامر.`
                        : `✅ تم تعيين اللغة إلى الدارجة!\n\nكتب *.menu* باش تشوف جميع الأوامر.`;

                await sock.sendMessage(chatId, { text: confirmMsg }, { quoted: msg });
                return;
            }

            return;
        }


        // Parse command and arguments
        const args = messageText.slice(settings.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Anti-Spam Check (Bypass for owner already defined by isUserOwner)
        const now = Date.now();
        if (!isUserOwner && spamMap.has(senderId)) {
            const lastTime = spamMap.get(senderId);
            if (now - lastTime < SPAM_THRESHOLD) {
                console.log(`[Anti-Spam] Blocking ${senderId} from frequent command: ${commandName}`);
                return; // Ignore if too fast for non-owners
            }
        }
        spamMap.set(senderId, now);

        // Get user language
        let userLang = 'ar';
        try {
            userLang = await getUserLanguage(senderId);
        } catch (e) { }

        // 🆕 CHECK: If user has no language set (and it's a private chat or explicit command), prompt them
        // We check if the user exists in logger with a language property.
        // Since getUserLanguage returns global default if not set, we need to check existence explicitly via getUser
        const { getUser } = require('./userLogger');
        const userProfile = getUser(senderId);

        // If user is new (no language set) AND messagetype is text
        if ((!userProfile || !userProfile.language) && !isGroup && !msg.key.fromMe) {
            // Allow .setlang command to pass through by checking commandName instead of full messageText
            if (commandName !== 'setlang' && commandName !== 'لغة') {
                const welcomeMsg = `👋 *Welcome to ${settings.botName}*\n\n🌍 Please choose your language to continue:\n🌍 المرجو اختيار لغتك للمتابعة:\n\n1️⃣ *.setlang en* or just *1* (English)\n2️⃣ *.setlang ar* or just *2* (العربية)\n3️⃣ *.setlang ma* or just *3* (الدارجة)`;
                await sock.sendMessage(chatId, { text: welcomeMsg }, { quoted: msg });
                return; // Stop processing until they set language
            }
        }

        // Check if command exists
        if (!commands.has(commandName)) {
            // Comprehensive Alias Map for English & Arabic parity
            const aliasMap = {
                // Modes & Core
                'public': 'mode', 'self': 'mode', 'private': 'mode', 'mode': 'mode', 'groups': 'mode',
                'عام': 'mode', 'خاص': 'mode', 'مجموعات': 'mode', 'وضع': 'mode',
                'مساعدة': 'help', 'menu': 'help', 'قائمة': 'menuu', 'help': 'help', 'اوامر': 'menuu', 'menuu': 'menuu',
                'المالك': 'owner', 'owner': 'owner', 'المطور': 'owner',
                'بينغ': 'ping', 'ping': 'ping',
                'بوت': 'alive', 'alive': 'alive', 'حي': 'alive',
                'status': 'system', 'system': 'system', 'restart': 'system', 'reboot': 'system', 'نظام': 'system',
                'clearsession': 'clearsession', 'cs': 'clearsession', 'مسح_جلسة': 'clearsession', 'مسح-جلسة': 'clearsession',
                'admin': 'admin', 'أدمن': 'admin', 'ادمن': 'admin',
                'addsudo': 'addsudo', 'إضافة_مشرف': 'addsudo', 'اضافة_مشرف': 'addsudo',
                'delsudo': 'delsudo', 'حذف_مشرف': 'delsudo',
                'listadmin': 'listadmin', 'قائمة_المشرفين': 'listadmin', 'الأدمن': 'listadmin',

                // Admin & Group
                'طرد': 'kick', 'kick': 'kick', 'remove': 'kick',
                'ترقية': 'promote', 'promote': 'promote', 'admin': 'promote',
                'تخفيض': 'demote', 'demote': 'demote', 'unadmin': 'demote',
                'حظر': 'ban', 'ban': 'ban',
                'الغاء_الحظر': 'unban', 'الغاء-حظر': 'unban', 'فك_الحظر': 'unban', 'unban': 'unban',
                'بلوك': 'block', 'block': 'block', 'حظر-شخص': 'block',
                'الغاء_حظر': 'unblock', 'فك_حظر': 'unblock', 'unblock': 'unblock', 'فك-بلوك': 'unblock',
                'منشن': 'tagall', 'tagall': 'tagall',
                'اخفاء': 'hidetag', 'hidetag': 'hidetag',
                'مجموعة': 'group', 'group': 'group',
                'منع_روابط': 'antilink', 'منع-روابط': 'antilink', 'antilink': 'antilink',
                'schedule': 'schedule', 'autogroup': 'schedule', 'توقيت-المجموعة': 'schedule', 'جدولة': 'schedule',
                'warn': 'warn', 'تحذير': 'warn',
                'warnings': 'warnings', 'تحذيرات': 'warnings',
                'pmblocker': 'pmblocker', 'pmbloker': 'pmblocker', 'مانع_الخاص': 'pmblocker', 'حظر-خاص': 'pmblocker',
                'autoread': 'autoread', 'ar': 'autoread', 'قراءة_تلقائية': 'autoread',
                'أخبار': 'news', 'akhbar': 'news', 'news': 'news',
                'hmm': 'ghosttag', 'ghosttag': 'ghosttag', 'تاغ_مخفي': 'ghosttag',
                'anticall': 'anticall', 'منع_المكالمات': 'anticall', 'منع-مكالمات': 'anticall',
                'antidelete': 'antidelete', 'مانع_الحذف': 'antidelete',
                'mute': 'mute', 'كتم': 'mute',
                'unmute': 'unmute', 'الغاء-كتم': 'unmute',
                'close': 'close', 'اغلاق': 'close', 'إغلاق': 'close',
                'open': 'open', 'فتح': 'open',
                'antibadword': 'antibadword', 'منع-شتائم': 'antibadword',
                'welcome': 'welcome', 'ترحيب': 'welcome',
                'goodbye': 'goodbye', 'وداع': 'goodbye',
                'staff': 'staff', 'طاقم': 'staff',
                'delete': 'delete', 'حذف': 'delete',

                // AI Tools
                'ai': 'gpt', 'ia': 'gpt', 'gpt': 'gpt', 'gemini': 'gemini', 'ذكاء': 'gpt',
                'gpt4': 'gpt', 'ذكاء4': 'gpt',
                'gpt4o': 'gpt', 'ذكاء-برو': 'gpt', 'ذكاء_برو': 'gpt',
                'gpt4om': 'gpt', 'ذكاء-ميني': 'gpt', 'ذكاء_ميني': 'gpt',
                'gpt3': 'gpt', 'ذكاء3': 'gpt',
                'o1': 'gpt', 'ذكاء-متقدم': 'gpt', 'ذكاء_متقدم': 'gpt',
                'gemini-analyze': 'gemini-analyze', 'gemini-pro': 'gemini-analyze', 'جيميني-حلل': 'gemini-analyze', 'حلل': 'gemini-analyze', 'حلل-صور': 'gemini-analyze', 'تحليل': 'gemini-analyze', 'تحليل-صور': 'gemini-analyze',
                'deepseek': 'deepseek', 'بحث-عميق': 'deepseek', 'بحث_عميق': 'deepseek',
                'aiart': 'aiart', 'ذكاء_اصطناعي': 'aiart', 'فن-الذكاء': 'aiart',
                'genai': 'genai', 'generate': 'genai', 'توليد': 'genai', 'رسم': 'genai', 'صورة': 'genai', 'توليد-صور': 'genai',
                'imagine': 'imagine', 'تخيل': 'imagine',
                'qwen': 'qwen', 'qwenai': 'qwen', 'كوين': 'qwen',
                'banana': 'banana-ai', 'banana-ai': 'banana-ai', 'موز': 'banana-ai',
                'edit': 'nanobanana', 'edite': 'nanobanana', 'تعديل': 'nanobanana',
                'ai-enhance': 'ai-enhance', 'enhance': 'ai-enhance', 'تحسين': 'ai-enhance',
                'colorize': 'colorize', 'talwin': 'colorize', 'تلوين': 'colorize',
                'remini': 'remini', 'تحسين_الصور': 'remini', 'ريميني': 'remini',
                'unblur': 'remini', 'توضيح': 'remini',
                'faceswap': 'faceswap', 'تبديل_الوجوه': 'faceswap', 'تبديل-وجه': 'faceswap',
                'ghibli': 'ghibli', 'ghibli-art': 'ghibli', 'جيبلي': 'ghibli', 'فن-جيبلي': 'ghibli',
                'aicheck': 'aicheck', 'aidetect': 'aicheck', 'كشف_الذكاء': 'aicheck',
                'waterbot': 'waterbot', 'waterai': 'waterbot', 'بوت_الماء': 'waterbot',
                'ask': 'gpt', 'gpt3': 'gpt', 'gpt4': 'gpt', 'gpt4o': 'gpt', 'gpt4om': 'gpt', 'gpt4t': 'gpt', 'o1': 'gpt', 'o1m': 'gpt',
                'removebg': 'removebg', 'ازالة_الخلفية': 'removebg', 'إزالة_الخلفية': 'removebg', 'حذف-خلفية': 'removebg',
                'gemini': 'gemini', 'جيميني': 'gemini',
                'miramuse': 'miramuse', 'ميرا': 'miramuse',
                'musicgen': 'musicgen', 'توليد-موسيقى': 'musicgen',
                'hdvideo': 'hdvideo', 'فيديو-عالي': 'hdvideo',
                'winkvideo': 'winkvideo', 'وينك': 'winkvideo',
                'brat-vd': 'brat-vd', 'برات': 'brat-vd',

                // Media & Editing
                'sticker': 'sticker', 'ستيكر': 'sticker', 's': 'sticker', 'gif': 'sticker', 'togif': 'sticker', 'ملصق': 'sticker',
                'toimage': 'simage', 'toimg': 'simage', 'convert': 'simage', 'لصورة': 'simage', 'لصوره': 'simage',
                'tomp3': 'tomp3', 'mp3': 'tomp3', 'صوت': 'tomp3',
                'tovideo': 'video', 'video': 'video', 'فيديو': 'video', 'vedio': 'video', 'védio': 'video', 'tomp4': 'video',
                'attp': 'attp', 'ttp': 'ttp', 'نص-متحرك': 'attp', 'نص-ملون': 'ttp',
                'vocalremover': 'vocalremover', 'hazf-sawt': 'vocalremover', '3azlsawt': 'vocalremover', 'عزل_صوت': 'vocalremover', 'عزل-صوت': 'vocalremover',
                'carbon': 'carbon',
                'screenshot': 'screenshot', 'سكرين': 'screenshot', 'ss': 'screenshot', 'لقطة': 'screenshot',
                'lyrics': 'lyrics', 'kalimat': 'lyrics', 'كلمات_الأغنية': 'lyrics', 'كلمات': 'lyrics',
                'img-blur': 'img-blur', 'طمس': 'img-blur',
                'say': 'say', 'قول': 'say',
                'sticker-alt': 'sticker-alt', 'ستيكر2': 'sticker-alt',

                // Downloaders
                'quran': 'quran', 'قرآن': 'quran', 'قران': 'quran', 'تلاوة': 'quran',
                'tafsir': 'tafsir', 'تفسير': 'tafsir',
                'prayertimes': 'prayertimes', 'مواقيت': 'prayertimes', 'صلاة': 'prayertimes', 'أوقات': 'prayertimes', 'أوقات_الصلاة': 'prayertimes',
                'adhan': 'adhan', 'أذان': 'adhan', 'اذان': 'adhan',
                'ad3iya': 'ad3iya', 'أدعية': 'ad3iya', 'ادعية': 'ad3iya',
                'hadith': 'hadith', 'حديث': 'hadith',
                'azkar': 'azkar', 'أذكار': 'azkar',
                'qibla': 'qibla', 'قبلة': 'qibla',
                'sira': 'deen', 'سيرة': 'deen', 'السيرة': 'deen',
                'qisas': 'deen', 'قصص': 'deen', 'القصص': 'deen',
                'asmaa': 'asmaa', 'اسماء_الله': 'asmaa', 'أسماء_الله': 'asmaa',
                'ayah': 'ayah', 'آية': 'ayah', 'اية': 'ayah',
                'dua': 'dua', 'دعاء': 'dua',
                'surah': 'surah', 'سورة': 'surah',
                'mawt': 'deen', 'موت': 'deen',
                'shirk': 'deen', 'شرك': 'deen',
                'hub': 'deen', 'حب': 'deen',
                'deen': 'deen', 'دين': 'deen',

                // Social Downloaders
                'facebook': 'facebook', 'فيسبوك': 'facebook', 'فيس': 'facebook', 'فايسبوك': 'facebook',
                'instagram': 'instagram', 'انستا': 'instagram', 'انستكرام': 'instagram', 'انستغرام': 'instagram',
                'tiktok': 'tiktok', 'تيكتوك': 'tiktok', 'تيك': 'tiktok', 'تيك_توك': 'tiktok',
                'youtube': 'video', 'يوتيوب': 'video', 'فيديو': 'video', 'vedio': 'video', 'védio': 'video', 'tomp4': 'video',
                'mediafire': 'mediafire', 'ميديافاير': 'mediafire', 'ميديا_فاير': 'mediafire',
                'song': 'song', 'أغنية': 'song', 'music': 'song', 'اغنية': 'song',
                'play': 'play', 'شغل': 'play', 'play2': 'play2', 'تشغيل': 'play2', 'ytplay': 'ytplay',
                'yts': 'yts', 'بحث': 'yts', 'بحث-يوتيوب': 'yts',
                'apk': 'apk', 'تطبيق': 'apk', 'apk2': 'apk2', 'apk3': 'apk3', 'تطبيقات': 'apk',
                'github': 'github', 'جيتهاب': 'github',

                // Fun & Games
                'menugame': 'menugame', 'gamemenu': 'menugame', 'العاب': 'menugame', 'ألعاب': 'menugame', 'قائمة-ألعاب': 'menugame',
                'joke': 'joke', 'نكتة': 'joke', 'نكته': 'joke',
                'meme': 'meme', 'ميم': 'meme',
                'cat': 'cat', 'قط': 'cat', 'قطة': 'cat',
                'dog': 'dog', 'كلب': 'dog',
                'fact': 'fact', 'حقيقة': 'fact', 'معلومة': 'fact',
                'quote': 'quote', 'اقتباس': 'quote',
                'stupid': 'stupid', 'mklakh': 'stupid', 'مكلخ': 'stupid',
                'flirt': 'flirt', 'غزل': 'flirt',
                'eightball': 'eightball', 'حظ': 'eightball', 'توقع': 'eightball', 'كرة-سحرية': 'eightball',
                'compliment': 'compliment', 'مدح': 'compliment',
                'insult': 'insult', 'سب': 'insult', 'معيرة': 'insult',
                'hangman': 'hangman', 'مشنقة': 'hangman',
                'tictactoe': 'tictactoe', 'xo': 'tictactoe', 'ttt': 'tictactoe', 'اكس_او': 'tictactoe', 'اكس-او': 'tictactoe',
                'ship': 'ship', 'كوبل': 'ship', 'توافق': 'ship',
                'character': 'character', 'شخصية': 'character',
                'goodnight': 'goodnight', 'نعاس': 'goodnight', 'تصبح_على_خير': 'goodnight',
                'truth': 'truth', 'dare': 'dare', 'صراحة': 'truth', 'تحدي': 'dare',
                '4kwallpaper': '4kwallpaper', 'wallpaper4k': '4kwallpaper', 'خلفيات': '4kwallpaper',
                'ngl': 'ngl', 'صراحة-مجهولة': 'ngl',
                'rps': 'rps', 'حجر-ورقة': 'rps',
                'math': 'math', 'رياضيات': 'math',
                'guess': 'guess', 'تخمين': 'guess',
                'scramble': 'scramble', 'خلط-كلمات': 'scramble',
                'riddle': 'riddle', 'لغز': 'riddle',
                'quiz': 'quiz', 'مسابقة': 'quiz',
                'trivia': 'trivia', 'ثقافة': 'trivia',
                'guesswho': 'guesswho', 'whoami': 'guesswho', 'شكون_انا': 'guesswho', 'شكون': 'guesswho',

                // Leveling & Economy
                'بروفايل': 'profile', 'حسابي': 'profile', 'ملفي': 'profile', 'profile': 'profile', 'p': 'profile', 'my': 'profile',
                'يومي': 'daily', 'يومية': 'daily', 'daily': 'daily', 'bonus': 'daily',
                'ترتيب': 'top', 'اوائل': 'top', 'top': 'top', 'leaderboard': 'top', 'rank': 'top',
                'متجر': 'shop', 'محل': 'shop', 'shop': 'shop', 'store': 'shop', 'market': 'shop',
                'قمار': 'gamble', 'رهان': 'gamble', 'gamble': 'gamble', 'bet': 'gamble',
                'slots': 'slots', 'slot': 'slots', 'ماكينة': 'slots',
                'blackjack': 'blackjack', 'bj': 'blackjack', '21': 'blackjack', 'بلاك-جاك': 'blackjack',
                'level': 'profile', 'xp': 'profile', 'wallet': 'profile',

                // Education & Tools
                'translate': 'translate', 'tr': 'translate', 'ترجمة': 'translate',
                'setlang': 'setlang', 'لغة': 'setlang', 'لغه': 'setlang',
                'weather': 'weather', 'طقس': 'weather', 'الجو': 'weather',
                'google': 'google', 'g': 'google', 'غوغل': 'google', 'جوجل': 'google',
                'wiki': 'wiki', 'wikipedia': 'wiki', 'ويكيبيديا': 'wiki', 'ويكي': 'wiki',
                'calc': 'calc', 'حساب': 'calc', 'calculator': 'calc', 'حاسبة': 'calc',
                'alloschool': 'alloschool', 'alloschoolget': 'alloschool', 'مدرسة': 'alloschool',
                'tahlil-soura': 'checkimage', 'checkimage': 'checkimage', 'فحص-صورة': 'checkimage',
                'tts': 'tts', 'say': 'tts', 'نطق': 'tts', 'قول': 'tts',
                'pdf': 'pdf', 'كتاب': 'pdf', 'مستند': 'pdf', 'بي-دي-اف': 'pdf',
                'pdf2img': 'pdf2img', 'pdftoimg': 'pdf2img', 'pdf_to_img': 'pdf2img', 'pdf-img': 'pdf2img', 'صور-pdf': 'pdf2img', 'pdf-صور': 'pdf2img', 'صور_ملف': 'pdf2img', 'صور-بي-دي-اف': 'pdf2img',
                'stt': 'stt', 'transcribe': 'stt', 'تحويل_صوت': 'stt', 'كتابة-أوديو': 'stt', 'تفريغ': 'stt',
                'lyrics': 'lyrics', 'kalimat': 'lyrics', 'كلمات_الأغنية': 'lyrics',
                'recipe': 'recipe', 'wasfa': 'recipe', 'وصفة': 'recipe',
                'car': 'car', 'sayara': 'car', 'سيارة': 'car',
                'currency': 'currency', 'sarf': 'currency', 'تحويل_عملات': 'currency', 'صرف': 'currency',
                'qr': 'qrcode', 'qrcode': 'qrcode', 'باركود': 'qrcode', 'كود-كيو-آر': 'qrcode',
                'ocr': 'ocr', 'استخراج_النص': 'ocr', 'استخراج-نص': 'ocr',
                'نانو': 'nanobanana', 'editimg': 'nanobanana', 'nanobanana': 'nanobanana',
                'سكرين': 'screenshot', 'screenshot': 'screenshot', 'ss': 'screenshot',
                'جيميني-حلل': 'gemini-analyze', 'gemini-analyze': 'gemini-analyze', 'gemini-pro': 'gemini-analyze',
                'menuu': 'menuu', 'menuar': 'menuu', 'menu-ar': 'menuu', 'اوامر': 'menuu', 'قائمة_اوامر': 'menuu',

                // Owner
                'devmsg': 'devmsg', 'broadcast': 'devmsg', 'bouth': 'devmsg', 'بث': 'devmsg',
                'veo3-prompt': 'veo3-prompt', 'veo-prompt': 'veo3-prompt',
                'newmenu': 'newmenu',
                'allmenu': 'allmenu', 'listall': 'allmenu', 'menuall': 'allmenu', 'all': 'allmenu', 'كل-الأوامر': 'allmenu',
                'sudo': 'sudo', 'مشرف': 'sudo',
                'clear': 'clear', 'مسح': 'clear',
                'cleartmp': 'cleartmp', 'مسح-مؤقت': 'cleartmp',
                'autoreminder': 'autoreminder', 'تذكير-تلقائي': 'autoreminder',
                'backup': 'backup', 'نسخة-احتياطية': 'backup',

                // News & Sports
                'news': 'news', 'أخبار': 'news', 'اخبار': 'news',
                'football': 'football', 'كرة-قدم': 'football', 'كورة': 'football', 'kora': 'football',
                'taqes': 'weather', 'طقس': 'weather',

                // Others
                'imdb': 'imdb', 'فيلم': 'imdb',
                'resetlink': 'resetlink', 'اعادة-رابط': 'resetlink'
            };

            const actualCommandName = aliasMap[commandName];
            if (actualCommandName && commands.has(actualCommandName)) {
                console.log(`[Handler] 📌 Alias Found: "${commandName}" -> "${actualCommandName}" | Chat: ${chatId}`);
                const command = commands.get(actualCommandName);
                const match = args.join(' ');

                if (typeof command === 'function' || (command && typeof command.execute === 'function')) {
                    // 🛡️ ANTI-BAN: Simulate Typing
                    try {
                        await sock.sendPresenceUpdate('composing', chatId);
                        const randomDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5 seconds delay
                        await new Promise(resolve => setTimeout(resolve, randomDelay));
                        await sock.sendPresenceUpdate('paused', chatId);
                    } catch (e) { }

                    if (typeof command === 'function') {
                        await command(sock, chatId, msg, args, commands, userLang, match);
                    } else {
                        await command.execute(sock, chatId, msg, args, commands, userLang, match);
                    }
                }
                return;
            }


            console.log(`❌ Command not found: ${commandName}`);

            // Command not found - send helpful message to owner only
            if (isUserOwner) {
                await sendWithChannelButton(sock, chatId, `❌ *الأمر \`${settings.prefix}${commandName}\` غير موجود!*

📋 لعرض الأوامر المتاحة: *${settings.prefix}help*
⚔️ ${settings.botName}`, msg);
            }

            return;
        }

        // Execute command
        const command = commands.get(commandName);
        if (command) {
            console.log(`[Handler] 🚀 Found Command: "${commandName}" | Triggered by: ${senderId}`);
            // FIX: Ensure 'match' is passed as a string (args.join) to prevent .trim() errors
            const match = args.join(' ');

            // 🛡️ ANTI-BAN: Simulate Typing
            try {
                await sock.sendPresenceUpdate('composing', chatId);
                const randomDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5 seconds delay
                await new Promise(resolve => setTimeout(resolve, randomDelay));
                await sock.sendPresenceUpdate('paused', chatId);
            } catch (e) { }

            if (typeof command === 'function') {
                await command(sock, chatId, msg, args, commands, userLang, match);
            } else if (typeof command.execute === 'function') {
                await command.execute(sock, chatId, msg, args, commands, userLang, match);
            }
        } else {
            console.error(`Command ${commandName} is not a function or object with execute():`, typeof command);
        }

    } catch (error) {
        console.error('Error handling message:', error);
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                text: t('common.error', await getUserLanguage(msg.key.participant || msg.key.remoteJid))
            }, { quoted: msg });
        } catch (e) {
            console.error('Error sending error message:', e);
        }
    }
}

// Export the handler
module.exports = handleMessage;
