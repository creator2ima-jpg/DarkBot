const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =========================================
// 🌐 1. خادم الويب
// =========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('البوت يعمل بنجاح! وضع الـ Debugging مفعل 🚀'); });
app.listen(PORT, () => { console.log(`🌍 خادم الويب يعمل على المنفذ ${PORT}`); });

// =========================================
// 🗄️ 2. نظام الذاكرة الدائمة
// =========================================
const dataPath = fs.existsSync('/data') ? '/data' : __dirname;
const dbFile = path.join(dataPath, 'warnings.json');
const settingsFile = path.join(dataPath, 'settings.json');
const merchantsFile = path.join(dataPath, 'merchants.json');
const swearStatsFile = path.join(dataPath, 'swear_stats.json');

const saveTimeouts = {};

function debouncedSave(filePath, data) {
    if (saveTimeouts[filePath]) clearTimeout(saveTimeouts[filePath]);
    saveTimeouts[filePath] = setTimeout(() => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), err => {
            if (err) console.error(`خطأ في حفظ ${path.basename(filePath)}:`, err.message);
        });
        delete saveTimeouts[filePath];
    }, 2000); 
}

function safeReadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            if (!raw) return defaultValue;
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`⚠️ ملف ${path.basename(filePath)} معطوب، سيتم استخدام الافتراضي.`);
    }
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
}

let userWarnings = safeReadJSON(dbFile);
function saveWarnings() { debouncedSave(dbFile, userWarnings); }

let groupSettings = safeReadJSON(settingsFile);
function saveSettings() { debouncedSave(settingsFile, groupSettings); }

let pendingMerchantsData = safeReadJSON(merchantsFile);
const pendingMerchants = {};
function saveMerchants() {
    const toSave = {};
    for (const key in pendingMerchants) { toSave[key] = pendingMerchants[key].expireTime; }
    debouncedSave(merchantsFile, toSave);
}

let swearStats = safeReadJSON(swearStatsFile);
function saveSwearStats() { debouncedSave(swearStatsFile, swearStats); }

// =========================================
// 🔓 3. كسر الأقفال وتنظيف الكاش
// =========================================
function unlockChromiumProfile() {
    try {
        const sessionPath = path.join(dataPath, 'session');
        if (fs.existsSync(sessionPath)) {
            let deletedCount = 0;
            const files = fs.readdirSync(sessionPath);
            for (const file of files) {
                if (file.startsWith('Singleton')) {
                    const filePath = path.join(sessionPath, file);
                    try { fs.rmSync(filePath, { force: true, recursive: true }); deletedCount++; } catch (e) {}
                }
            }
            if (deletedCount > 0) console.log(`🔓 تم كسر وتدمير (${deletedCount}) قفل وهمي.`);
        }
    } catch (err) {}
}

function clearChromiumCache() {
    try {
        const basePath = path.join(dataPath, 'session', 'Default');
        if (!fs.existsSync(basePath)) return;
        const junkFolders =['Cache', 'Code Cache', 'Media Cache', 'GPUCache', 'VideoDecodeStats', path.join('Service Worker', 'CacheStorage')];
        junkFolders.forEach(folder => {
            const targetPath = path.join(basePath, folder);
            if (fs.existsSync(targetPath)) { try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch (e) {} }
        });
        console.log('🧹 تم تنظيف كاش المتصفح الميت.');
    } catch (err) {}
}

unlockChromiumProfile();
clearChromiumCache();

// =========================================
// 🚫 4. نظام Anti-Spam
// =========================================
const spamTracker = {};
const SPAM_LIMIT = 5;
const SPAM_WINDOW = 10000;

function isSpamming(senderId) {
    const now = Date.now();
    if (!spamTracker[senderId] || (now - spamTracker[senderId].lastReset > SPAM_WINDOW)) {
        spamTracker[senderId] = { count: 1, lastReset: now };
        return false;
    }
    spamTracker[senderId].count++;
    return spamTracker[senderId].count > SPAM_LIMIT;
}

setInterval(() => {
    const now = Date.now();
    for (const key in spamTracker) {
        if (now - spamTracker[key].lastReset > SPAM_WINDOW * 2) delete spamTracker[key];
    }
}, 10 * 60 * 1000);

setInterval(() => {
    let changed = false;
    for (const key in userWarnings) {
        if (userWarnings[key] === 0) { delete userWarnings[key]; changed = true; }
    }
    if (changed) saveWarnings();
    if (global.gc) { global.gc(); }
}, 2 * 60 * 60 * 1000);

// =========================================
// 👑 5. الثوابت، المالكين، وفلاتر النصوص
// =========================================
const MY_ADMIN_NUMBERS =[
    "201092996413",
    "201091885491",
    "27041768431630"
];

function normalizeNumber(idStr) {
    if (!idStr) return "";
    let clean = idStr.toString().replace(/:\d+/, "").split('@')[0].replace(/\D/g, "");
    if (clean.startsWith('01') && clean.length === 11) {
        clean = '2' + clean;
    }
    return clean;
}

const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = طرد 🟥\n3. ممنوع منشن للكل 🟥\n4. صلِّ على النبي في قلبك كده، واذكر الله.`;

const GLOBAL_LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|me|info|link|co|tv|ly)\b)|(wa\.me\/\d+)/i;

const badWords =['شرموط', 'متناك', 'هنيكك', 'خدك عليه', 'معرص', 'عرص', 'خول', 'علق', 'زاني', 'زانية', 'سكس', 'كسمك', 'كشمك', 'كس', 'كسم امك', 'يكسمك', 'يمتناك', 'العرص', 'يمعرص', 'قحبة', 'متناكين'];

function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652\u0640\u200B-\u200D\uFEFF]/g, "");
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
    return t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, "").replace(/(.)\1+/gu, "$1");
}
const cleanedBadWords = badWords.map(word => cleanText(word));

function containsBadWordSmart(messageText) {
    const cleanedMessage = cleanText(messageText);
    const messageWords = cleanedMessage.split(/\s+/);
    return messageWords.some(userWord => cleanedBadWords.some(badWord => {
        let strippedWord = userWord.replace(/^(ال|و|ف|ب|ك|ل)+/, '');
        return userWord === badWord || strippedWord === badWord;
    }));
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

// =========================================
// 🚀 6. إعدادات البوت والاتصال 
// =========================================
let isReconnecting = false;
let isBotReady = false;
let connectionAttemptTime = Date.now();

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataPath }),
    puppeteer: {
        headless: true,
        args:[
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--js-flags="--max-old-space-size=200"',
            '--disk-cache-size=1',
            '--disable-application-cache',
            '--disable-offline-load-stale-cache',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=site-per-process,Translate,OptimizationHints,MediaRouter',
            '--renderer-process-limit=1',
            '--mute-audio'
        ]
    }
});

client.on('qr', qr => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('🔗 افتح هذا الرابط لمسح الـ QR:\n' + qrUrl);
    try { qrcode.generate(qr, { small: true }); } catch (e) {}
});

client.on('ready', () => {
    console.log('✅ البوت جاهز ومستقر ويعمل الآن.');
    isBotReady = true;
    restoreMerchantTimers();
});

client.on('disconnected', async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    isBotReady = false;
    connectionAttemptTime = Date.now();
    console.log('🔄 انقطع الاتصال صراحةً، إعادة التشغيل...');
    try { await client.destroy(); } catch (err) {}
    setTimeout(async () => {
        try { await client.initialize(); } catch (err) {}
        isReconnecting = false;
    }, 5000);
});

setInterval(() => {
    if (!isBotReady && (Date.now() - connectionAttemptTime > 6 * 60 * 1000)) {
        console.log('🚨 كلب الحراسة: البوت معلق! جاري القتل الإجباري...');
        process.exit(1);
    }
}, 60 * 1000);

setInterval(async () => {
    const memoryData = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryData.rss / 1024 / 1024);
    
    if (isBotReady && !isReconnecting) {
        try {
            const state = await client.getState();
            if (state !== 'CONNECTED') throw new Error('Not Connected');
        } catch (error) {
            console.log('🚨 اكتشاف تجمد صامت! جاري الإنعاش القسري...');
            isReconnecting = true;
            isBotReady = false;
            connectionAttemptTime = Date.now();
            try {
                await client.destroy();
                unlockChromiumProfile();
                clearChromiumCache();
                setTimeout(async () => {
                    try { await client.initialize(); } catch (err) {}
                    isReconnecting = false;
                }, 5000);
            } catch (e) { isReconnecting = false; }
            return; 
        }
    }

    if (memoryUsageMB > 250 && !isReconnecting) {
        console.log('🚨 تحذير: الرامات ترتفع بسرعة! جاري كبح المتصفح...');
        isReconnecting = true;
        isBotReady = false;
        connectionAttemptTime = Date.now();
        try {
            await client.destroy();
            unlockChromiumProfile();
            clearChromiumCache();
            if (global.gc) { global.gc(); }
            setTimeout(async () => {
                try { await client.initialize(); } catch (err) {}
                isReconnecting = false;
            }, 5000);
        } catch (e) { isReconnecting = false; }
    }
}, 3 * 60 * 1000);

// =========================================
// 🛡️ 7. نظام توثيق التجار
// =========================================
async function restoreMerchantTimers() {
    const now = Date.now();
    for (const userKey in pendingMerchantsData) {
        const expireTime = pendingMerchantsData[userKey];
        const remaining = expireTime - now;
        const parts = userKey.split('_SPLIT_');
        const chatId = parts[0], userId = parts[1];

        if (remaining <= 0) {
            try {
                const chat = await client.getChatById(chatId);
                const botNumber = client.info && client.info.wid ? normalizeNumber(client.info.wid._serialized) : "";
                if (chat.participants.some(p => normalizeNumber(p.id._serialized) === botNumber && (p.isAdmin || p.isSuperAdmin))) await chat.removeParticipants([userId]);
            } catch (err) {}
            delete pendingMerchantsData[userKey];
        } else {
            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const chat = await client.getChatById(chatId);
                        const userNumber = normalizeNumber(userId);
                        const botNumber = client.info && client.info.wid ? normalizeNumber(client.info.wid._serialized) : "";
                        if (chat.participants.some(p => normalizeNumber(p.id._serialized) === botNumber && (p.isAdmin || p.isSuperAdmin))) {
                            await chat.removeParticipants([userId]);
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة بدون توثيق.`, { mentions: [userId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}🚫 العضو (@${userNumber}) لم يوثق نفسه.\n(يرجى طرده، البوت منزوع الصلاحيات!)`, { mentions: [userId] });
                        }
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, remaining);

            const warningDelay = remaining - (3 * 60 * 1000);
            let warningTimer = null;
            if (warningDelay > 0) {
                warningTimer = setTimeout(async () => {
                    if (pendingMerchants[userKey]) {
                        try {
                            const chat = await client.getChatById(chatId);
                            await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${normalizeNumber(userId)})!\nمتبقي 3 دقائق فقط لعمل منشن لـ 5 تجار!`, { mentions: [userId] });
                        } catch (err) {}
                    }
                }, warningDelay);
            }
            pendingMerchants[userKey] = { warningTimer, kickTimer, expireTime };
        }
    }
    saveMerchants();
}

client.on('group_join', async (notification) => {
    try {
        const chatId = notification.chatId;
        const settings = groupSettings[chatId];
        if (!settings || !settings.merchant || !settings.expireAt || Date.now() > settings.expireAt) return;

        for (const joinedUserId of notification.recipientIds) {
            const userNumber = normalizeNumber(joinedUserId);
            if (MY_ADMIN_NUMBERS.includes(userNumber)) continue;

            const chat = await client.getChatById(chatId);
            const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\nأمامك (30 دقيقة) لإثبات أنك تاجر ولست زبوناً.\nقم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار مختلفين كضمان لك.\n⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
            await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

            const userKey = `${chatId}_SPLIT_${joinedUserId}`;
            const expireTime = Date.now() + (30 * 60 * 1000);

            const warningTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي 3 دقائق لعمل منشن لـ 5 تجار!`, { mentions: [joinedUserId] });
            }, 27 * 60 * 1000);

            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const botNumber = client.info && client.info.wid ? normalizeNumber(client.info.wid._serialized) : "";
                        if (chat.participants.some(p => normalizeNumber(p.id._serialized) === botNumber && (p.isAdmin || p.isSuperAdmin))) {
                            await chat.removeParticipants([joinedUserId]);
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة بدون توثيق.`, { mentions: [joinedUserId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}🚫 العضو (@${userNumber}) لم يوثق نفسه.\n(يرجى طرده، البوت منزوع الصلاحيات!)`, { mentions: [joinedUserId] });
                        }
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, 30 * 60 * 1000);

            pendingMerchants[userKey] = { warningTimer, kickTimer, expireTime };
            pendingMerchantsData[userKey] = expireTime; saveMerchants();
        }
    } catch (error) {}
});

client.on('group_admin_changed', async (notification) => {
    console.log('\n[DEBUG ADMIN NOTICE EVENT] =======================');
    console.log('[DEBUG] Raw Notification Object:', JSON.stringify(notification, null, 2));
    console.log('[DEBUG] Action:', notification.action, '| Type:', notification.type);
    console.log('[DEBUG] Author:', notification.author);
    console.log('[DEBUG] Recipients:', notification.recipientIds);
    console.log('==================================================\n');

    try {
        const chatId = notification.chatId;
        const settings = groupSettings[chatId];
        if (!settings || !settings.adminNotices || !settings.expireAt || Date.now() > settings.expireAt) return;

        const chat = await client.getChatById(chatId);
        
        let authorNumber = "مجهول";
        let authorId = notification.author;
        if (authorId) { authorNumber = normalizeNumber(authorId); }
        
        const dateNow = formatDate(Date.now());
        const eventType = notification.action || notification.type;

        if (!notification.recipientIds || !Array.isArray(notification.recipientIds)) return;

        for (const targetId of notification.recipientIds) {
            const targetNumber = normalizeNumber(targetId);
            
            let safeMentions =[];
            if (targetId && typeof targetId === 'string') safeMentions.push(targetId);
            if (authorId && typeof authorId === 'string') safeMentions.push(authorId);

            if (eventType === 'promote') {
                await chat.sendMessage(`${botPrefix}🟢 *إشعار إداري*\nتمت ترقية العضو (@${targetNumber}) ليصبح مشرفاً ✅\nبواسطة: (@${authorNumber})\n⏰ الوقت: ${dateNow}`, { mentions: safeMentions });
            } else if (eventType === 'demote') {
                await chat.sendMessage(`${botPrefix}🔴 *إشعار إداري*\nتم نزع الإشراف من العضو (@${targetNumber}) ❌\nبواسطة: (@${authorNumber})\n⏰ الوقت: ${dateNow}`, { mentions: safeMentions });
            }
        }
    } catch (err) { console.error('خطأ في إشعار المشرفين:', err.message); }
});

// =========================================
// 🕵️‍♂️ 8. المعالج الأساسي للرسائل
// =========================================
client.on('message_create', async msg => {
    try {
        const chat = await msg.getChat();

        let rawSenderId = msg.fromMe ? (msg.from || msg.to) : (msg.author || msg.from);
        if (msg.fromMe && client.info && client.info.wid) rawSenderId = client.info.wid._serialized;

        let senderId = rawSenderId.replace(/:\d+/, ""); 
        const senderNumber = normalizeNumber(senderId);

        const text = msg.body.trim();
        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber) || MY_ADMIN_NUMBERS.some(admin => senderNumber.endsWith(admin));

        // 🟢 DEBUG MESSAGE CREATION
        if (text === '!صلاحياتي' || text === '!طرد') {
            console.log('\n[DEBUG MESSAGE CREATE] ==========================');
            console.log('[DEBUG] Message Body:', text);
            console.log('[DEBUG] rawSenderId:', rawSenderId);
            console.log('[DEBUG] senderId:', senderId);
            console.log('[DEBUG] senderNumber:', senderNumber);
            console.log('[DEBUG] isBotOwner evaluated as:', isBotOwner);
            console.log('==================================================\n');
        }

        if (!chat.isGroup && !isBotOwner) return;

        // أوامر الإذاعة والخاص للمالك
        if (!chat.isGroup && isBotOwner) {
            // ... (تم إخفاء أوامر الخاص لتوفير المساحة، لم أقم بتغييرها)
            if (text === '!كل الجروبات' || text === '!الجروبات') {
                // ... logic
                return;
            }
            if (text.startsWith('!اذاعة')) {
                // ... logic
                return;
            }
            return; 
        }

        if (!chat.isGroup) return;

        const chatId = chat.id._serialized;
        
        let botIsAdmin = false;
        let isSenderAdmin = false;
        try {
            let botNumber = "";
            if (client.info && client.info.wid) botNumber = normalizeNumber(client.info.wid._serialized);
            
            // 🟢 DEBUG ADMIN CHECK
            if (text === '!صلاحياتي' || text === '!طرد') {
                console.log('\n[DEBUG ADMIN CHECK] =============================');
                console.log('[DEBUG] client.info.wid:', client.info && client.info.wid ? JSON.stringify(client.info.wid) : 'UNDEFINED');
                console.log('[DEBUG] Extracted botNumber:', botNumber);
                console.log('[DEBUG] First 3 Participants (Structure Check):', JSON.stringify(chat.participants.slice(0, 3), null, 2));
            }

            botIsAdmin = chat.participants.some(p => {
                let match = normalizeNumber(p.id._serialized) === botNumber;
                if (match && (text === '!صلاحياتي' || text === '!طرد')) console.log(`[DEBUG] Bot matched participant: isAdmin=${p.isAdmin}, isSuperAdmin=${p.isSuperAdmin}`);
                return match && (p.isAdmin || p.isSuperAdmin);
            });

            isSenderAdmin = chat.participants.some(p => {
                let match = normalizeNumber(p.id._serialized) === senderNumber;
                if (match && (text === '!صلاحياتي' || text === '!طرد')) console.log(`[DEBUG] Sender matched participant: isAdmin=${p.isAdmin}, isSuperAdmin=${p.isSuperAdmin}`);
                return match && (p.isAdmin || p.isSuperAdmin);
            });

            if (text === '!صلاحياتي' || text === '!طرد') {
                console.log('[DEBUG] Final botIsAdmin:', botIsAdmin);
                console.log('[DEBUG] Final isSenderAdmin:', isSenderAdmin);
                console.log('==================================================\n');
            }

        } catch(e) {
            console.error('[DEBUG ERROR in Admin Check]', e);
        }

        if (!groupSettings[chatId]) {
            groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false, antiMention: false, linkAction: 'kick', expireAt: null, expiredNotified: false, antiBotAbuse: false, adminKickCmd: false, adminNotices: false };
        }

        if (text === '!صلاحياتي') { 
            await chat.sendMessage(`${botPrefix}🔍 *كشف الصلاحيات:*\n👤 *رقمك:* ${senderNumber}\n👑 *المالك؟* ${isBotOwner ? 'نعم ✅' : 'لا ❌'}\n🛡️ *مشرف؟* ${isSenderAdmin ? 'نعم ✅' : 'لا ❌'}\n🤖 *هل البوت مشرف؟* ${botIsAdmin ? 'نعم ✅' : 'لا ❌'}`); 
            return; 
        }

        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        
        const isolatedUserKey = `${chatId}_${senderId}`; 
        
        if (text === '!انذاراتي') {
            // ... logic
            return;
        }

        if (text === '!قائمة الشتائم') {
            // ... logic
            return;
        }

        // =========================================
        // 🌟 أوامر المالك الخاصة بالجروب
        // =========================================
        if (isBotOwner) {
            const hasActiveSub = groupSettings[chatId].expireAt && Date.now() < groupSettings[chatId].expireAt;
            const featureCmds =['!تفعيل الروابط للاعضاء', '!تفعيل الروابط للكل', '!تفعيل الشتائم للاعضاء', '!تفعيل الشتائم للكل', '!تفعيل حماية البوت', '!تفعيل امر الطرد', '!تفعيل اشعارات المشرفين', '!تفعيل التجار', '!تفعيل الملصقات', '!تفعيل المنشن للاعضاء', '!تفعيل المنشن للكل'];
            
            if (featureCmds.includes(text) && !hasActiveSub) {
                await chat.sendMessage(`${botPrefix}⚠️ عذراً يا مديري، لا يمكنك تفعيل ميزات فرعية لأن الجروب *ليس لديه باقة اشتراك نشطة*.\nقم أولاً بكتابة (مثلاً: !تفعيل 1) لبدء باقة.`);
                return;
            }

            // ... (باقي أوامر المالك للتفعيل والإيقاف تعمل كما هي)
            if (text === '!تفعيل الروابط للاعضاء') { groupSettings[chatId].links = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط للأعضاء.`); return; }
            if (text === '!تفعيل الروابط للكل') { groupSettings[chatId].links = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط للجميع.`); return; }
            if (text === '!ايقاف الروابط') { groupSettings[chatId].links = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف مكافحة الروابط.`); return; }
            // ... لباقي الأوامر ...
        }

        const settings = groupSettings[chatId];
        if (!settings.expireAt) return; 

        if (Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                groupSettings[chatId].expiredNotified = true; saveSettings(); 
                try { await chat.sendMessage(`⚠️ انتهى اشتراك البوت في الجروب. يرجى التجديد.`); } catch (e) {}
            }
            return; 
        }

        // 🚨 أمر الطرد (متاح للمشرفين فقط) 
        if (settings.adminKickCmd && text === '!طرد') {
            console.log('\n[DEBUG KICK COMMAND] ============================');
            console.log('[DEBUG] isSenderAdmin:', isSenderAdmin, '| isBotOwner:', isBotOwner);
            
            if (!isSenderAdmin) {
                console.log('[DEBUG] Rejected because isSenderAdmin is false.');
                await msg.reply(`${botPrefix}⚠️ عذراً، يجب أن تكون (مشرفاً) لتتمكن من الطرد.`);
                return;
            }
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                console.log('[DEBUG] quotedMsg.author:', quotedMsg.author);
                console.log('[DEBUG] quotedMsg.from:', quotedMsg.from);
                
                let targetId = quotedMsg.author || quotedMsg.from;
                console.log('[DEBUG] Raw targetId before cleaning:', targetId);
                
                if (targetId.includes(':')) targetId = targetId.split(':')[0] + '@c.us'; 
                console.log('[DEBUG] Cleaned targetId:', targetId);

                if (botIsAdmin) {
                    try {
                        await chat.removeParticipants([targetId]);
                        await chat.sendMessage(`${botPrefix}✅ تم تنفيذ الطرد بنجاح بواسطة (@${senderNumber}).`, { mentions:[senderId] });
                    } catch (e) {
                        console.log('[DEBUG ERROR inside removeParticipants]', e);
                         await msg.reply(`${botPrefix}⚠️ فشل الطرد. قد يكون العضو مشرفاً أو غير موجود.`);
                    }
                } else {
                    console.log('[DEBUG] Bot refused to kick because botIsAdmin is false.');
                    await msg.reply(`${botPrefix}⚠️ لا أمتلك صلاحية الإشراف للطرد.`);
                }
            } else {
                console.log('[DEBUG] No quoted message found.');
                await msg.reply(`${botPrefix}⚠️ للاستخدام: قم بالرد (Reply) على رسالة الشخص واكتب !طرد`);
            }
            console.log('==================================================\n');
            return;
        }

        // ... (بقية كود العقوبات والحصانة يعمل كما هو بلا تغيير)
        
    } catch (err) {
        console.error('[CRITICAL DEBUG ERROR in message_create]', err);
    }
});

// =========================================
// 🕵️‍♂️ 11. نظام مراقبة الرسائل المعدلة
// =========================================
client.on('message_edit', async (msg, newBody, prevBody) => {
    // ...
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
