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
app.get('/', (req, res) => { res.send('البوت يعمل بنجاح! الأقفال مكسورة بقوة لينكس 🚀'); });
app.listen(PORT, () => { console.log(`🌍 خادم الويب يعمل على المنفذ ${PORT}`); });

// =========================================
// 🗄️ 2. نظام الذاكرة الدائمة والكاسحة
// =========================================
const dataPath = fs.existsSync('/data') ? '/data' : __dirname;
const dbFile = path.join(dataPath, 'warnings.json');
const settingsFile = path.join(dataPath, 'settings.json');
const merchantsFile = path.join(dataPath, 'merchants.json');
const swearStatsFile = path.join(dataPath, 'swear_stats.json'); 

function safeReadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            if (!raw) return defaultValue;
            return JSON.parse(raw);
        }
    } catch (e) {}
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
}

let userWarnings = safeReadJSON(dbFile);
function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }

let groupSettings = safeReadJSON(settingsFile);
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }

let pendingMerchantsData = safeReadJSON(merchantsFile);
const pendingMerchants = {};
function saveMerchants() {
    const toSave = {};
    for (const key in pendingMerchants) { toSave[key] = pendingMerchants[key].expireTime; }
    fs.writeFileSync(merchantsFile, JSON.stringify(toSave, null, 2));
}

let swearStats = safeReadJSON(swearStatsFile);
function saveSwearStats() { fs.writeFileSync(swearStatsFile, JSON.stringify(swearStats, null, 2)); }

function unlockChromiumProfile() {
    try {
        const sessionPath = path.join(dataPath, 'session'); 
        if (fs.existsSync(sessionPath)) {
            const files = fs.readdirSync(sessionPath);
            let deletedCount = 0;
            for (const file of files) {
                if (file.startsWith('Singleton')) {
                    const filePath = path.join(sessionPath, file);
                    try { fs.rmSync(filePath, { force: true, recursive: true }); deletedCount++; } catch (e) {}
                }
            }
            if (deletedCount > 0) console.log(`🔓 تم كسر وتدمير (${deletedCount}) من الأقفال الوهمية بنجاح.`);
        }
    } catch (err) {}
}

function clearChromiumCache() {
    try {
        const basePath = path.join(dataPath, 'session', 'Default');
        if (!fs.existsSync(basePath)) return;
        const junkFolders =['Cache', 'Code Cache', 'Media Cache', 'GPUCache', 'VideoDecodeStats', path.join('Service Worker', 'CacheStorage'), path.join('Service Worker', 'ScriptCache')];
        junkFolders.forEach(folder => {
            const targetPath = path.join(basePath, folder);
            if (fs.existsSync(targetPath)) { try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch(e){} }
        });
        console.log('🧹 تم تنظيف كاش المتصفح لضمان المزامنة السريعة.');
    } catch (err) {}
}

unlockChromiumProfile();
clearChromiumCache();

// =========================================
// 🚫 3. نظام Anti-Spam والتنظيف المجدول
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
    let changed = false;
    for (const key in userWarnings) {
        if (userWarnings[key] === 0) { delete userWarnings[key]; changed = true; }
    }
    if (changed) saveWarnings();
    for (const key in spamTracker) { delete spamTracker[key]; }
    
    unlockChromiumProfile();
    clearChromiumCache(); 
    if (global.gc) { global.gc(); } 
}, 2 * 60 * 60 * 1000); 

// =========================================
// 👑 4. أرقام المالكين
// =========================================
const MY_ADMIN_NUMBERS =[
    "201092996413",
    "201091885491",
    "27041768431630"
];

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

// =========================================
// 🚀 5. إعدادات البوت والاتصال 
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
        unlockChromiumProfile(); 
        try { await client.initialize(); } catch (err) {}
        isReconnecting = false;
    }, 5000);
});

// =========================================
// ⏱️ 6. كلب الحراسة (Watchdog) 
// =========================================
setInterval(() => {
    if (!isBotReady && (Date.now() - connectionAttemptTime > 6 * 60 * 1000)) {
        console.log('🚨 كلب الحراسة: البوت معلق لأكثر من 6 دقائق! جاري القتل الإجباري...');
        process.exit(1); 
    }
}, 60 * 1000); 

// =========================================
// 💓 7. جهاز كشف النبض والرامات
// =========================================
setInterval(async () => {
    const memoryData = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryData.rss / 1024 / 1024);
    console.log(`📊 الرامات: ${memoryUsageMB} MB`);

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

    if (memoryUsageMB > 250) {
        console.log('🚨 تحذير: الرامات ترتفع بسرعة! جاري كبح المتصفح...');
        if (isReconnecting) return;
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
// ⚙️ 8. إعدادات القوانين والكلمات المسيئة
// =========================================
const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = كيك (طرد) 🟥\n3. ممنوع منشن للكل 🟥\n4. صلِّ على النبي في قلبك كده، واذكر الله.`;
const badWords =['شرموط', 'متناك', 'هنيكك', 'خدك عليه', 'معرص', 'عرص', 'خول', 'علق', 'زاني', 'زانية', 'سكس', 'كسمك', 'كشمك', 'كس','كسم امك','يكسمك','يمتناك','العرص','يمعرص','قحبة','متناكين'];

function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
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

// =========================================
// 🛡️ 9. نظام توثيق التجار والمشرفين
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
                const botId = client.info.wid._serialized.replace(/:\d+/, "");
                if(chat.participants.some(p => p.id._serialized === botId && (p.isAdmin || p.isSuperAdmin))) await chat.removeParticipants([userId]);
            } catch (err) {}
            delete pendingMerchantsData[userKey];
        } else {
            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const chat = await client.getChatById(chatId);
                        const userNumber = userId.split('@')[0];
                        const botId = client.info.wid._serialized.replace(/:\d+/, "");
                        if(chat.participants.some(p => p.id._serialized === botId && (p.isAdmin || p.isSuperAdmin))) {
                            await chat.removeParticipants([userId]);
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة بدون توثيق.`, { mentions: [userId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}🚫 العضو (@${userNumber}) لم يوثق نفسه.\n(يرجى طرده، البوت منزوع الصلاحيات!)`, { mentions: [userId] });
                        }
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, remaining);

            let warningTimer = null;
            const warningDelay = remaining - (3 * 60 * 1000); 
            if (warningDelay > 0) {
                warningTimer = setTimeout(async () => {
                    if (pendingMerchants[userKey]) {
                        try {
                            const chat = await client.getChatById(chatId);
                            await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userId.split('@')[0]})!\nمتبقي 3 دقائق فقط لعمل منشن لـ 5 تجار!`, { mentions: [userId] });
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
            const userNumber = joinedUserId.split('@')[0];
            if (MY_ADMIN_NUMBERS.includes(userNumber)) continue;

            const chat = await client.getChatById(chatId);
            const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\nأمامك (30 دقيقة) لإثبات أنك تاجر ولست زبوناً.\nقم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار مختلفين كضمان لك.\n⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
            await chat.sendMessage(welcomeMsg, { mentions:[joinedUserId] });

            const userKey = `${chatId}_SPLIT_${joinedUserId}`;
            const expireTime = Date.now() + (30 * 60 * 1000); 

            const warningTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي 3 دقائق لعمل منشن لـ 5 تجار!`, { mentions: [joinedUserId] });
            }, 27 * 60 * 1000); 

            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const botId = client.info.wid._serialized.replace(/:\d+/, "");
                        if (chat.participants.some(p => p.id._serialized === botId && (p.isAdmin || p.isSuperAdmin))) {
                            await chat.removeParticipants([joinedUserId]);
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة بدون توثيق.`, { mentions:[joinedUserId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}🚫 العضو (@${userNumber}) لم يوثق نفسه.\n(يرجى طرده، البوت منزوع الصلاحيات!)`, { mentions:[joinedUserId] });
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
    try {
        const chat = await client.getChatById(notification.chatId);
        let authorNumber = "مجهول";
        if (notification.author) { authorNumber = notification.author.split('@')[0]; }
        const dateNow = formatDate(Date.now());

        for (const targetId of notification.recipientIds) {
            const targetNumber = targetId.split('@')[0];
            if (notification.action === 'promote') {
                await chat.sendMessage(`${botPrefix}🟢 *إشعار إداري*\nتمت ترقية العضو (@${targetNumber}) ليصبح مشرفاً ✅\nبواسطة: (@${authorNumber})\n⏰ الوقت: ${dateNow}`, { mentions:[targetId, notification.author] });
            } 
            else if (notification.action === 'demote') {
                await chat.sendMessage(`${botPrefix}🔴 *إشعار إداري*\nتم نزع الإشراف من العضو (@${targetNumber}) ❌\nبواسطة: (@${authorNumber})\n⏰ الوقت: ${dateNow}`, { mentions:[targetId, notification.author] });
            }
        }
    } catch (err) {}
});

// =========================================
// 📩 10. نظام استقبال الرسائل والأوامر
// =========================================
client.on('message_create', async msg => {
    try {
        const chat = await msg.getChat();
        let rawSenderId = msg.fromMe ? (msg.from || msg.to) : (msg.author || msg.from);
        if (msg.fromMe && client.info && client.info.wid) { rawSenderId = client.info.wid._serialized; }
        let senderId = rawSenderId.replace(/:\d+/, "");
        let senderNumber = senderId.split('@')[0].replace(/\D/g, "");

        try {
            const contact = await msg.getContact();
            if (contact && contact.number) { senderNumber = contact.number.replace(/\D/g, ""); }
        } catch(e) {}

        const text = msg.body.trim();
        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber) || MY_ADMIN_NUMBERS.some(admin => senderNumber.endsWith(admin));

        // 🛑 الحماية للخاص: المالك فقط المسموح له بإرسال أوامر الإذاعة
        if (!chat.isGroup && isBotOwner) {
            if (text === '!كل الجروبات' || text === '!الجروبات') {
                await chat.sendMessage(`${botPrefix}⏳ جاري جمع البيانات من الذاكرة...`);
                const now = Date.now();
                let report = `${botPrefix}📋 *تقرير الجروبات المسجلة:*\n\n`;
                let active = 0, expired = 0;
                let allChats =[];
                try { allChats = await client.getChats(); } catch(e) {}

                for (const gId in groupSettings) {
                    const gs = groupSettings[gId];
                    if (!gs.expireAt) continue;
                    let groupName = "غير معروف";
                    const targetChat = allChats.find(c => c.id._serialized === gId);
                    if (targetChat && targetChat.name) { groupName = targetChat.name; }
                    
                    if (gs.expireAt > now) {
                        active++;
                        const dLeft = Math.ceil((gs.expireAt - now) / (1000 * 60 * 60 * 24));
                        report += `🟢 *الاسم:* ${groupName}\n🆔 *الآيدي:* ${gId}\n⏳ *الحالة:* مفعل (باقي ${dLeft} يوم)\n\n`;
                    } else {
                        expired++;
                        report += `🔴 *الاسم:* ${groupName}\n🆔 *الآيدي:* ${gId}\n❌ *الحالة:* منتهي\n\n`;
                    }
                }
                report += `━━━━━━━━━━━━━━\n🟢 مفعل: ${active} | 🔴 منتهي: ${expired}`;
                await chat.sendMessage(report);
                return;
            }

            if (text.startsWith('!اذاعة')) {
                const isGeneralBroadcast = text.startsWith('!اذاعة عامة');
                const broadcastText = text.replace(isGeneralBroadcast ? '!اذاعة عامة' : '!اذاعة', '').trim();
                
                if (!broadcastText && !msg.hasMedia) {
                    await chat.sendMessage(`${botPrefix}⚠️ خطأ! يرجى كتابة الرسالة أو إرفاق صورة/فيديو مع الأمر.\nمثال: !اذاعة عامة السلام عليكم`);
                    return;
                }
                await chat.sendMessage(`${botPrefix}⏳ جاري تجهيز الإذاعة...\nالنوع: ${isGeneralBroadcast ? 'عامة (لكل الجروبات)' : 'خاصة (للمشتركين فقط)'}\nسيتم الإرسال ببطء لتجنب حظر رقم البوت.`);
                
                let targetGroups =[]; let allChats =[];
                try { allChats = await client.getChats(); } catch(e) {}

                if (isGeneralBroadcast) { targetGroups = allChats.filter(c => c.isGroup).map(c => c.id._serialized); } 
                else { const now = Date.now(); for (const gId in groupSettings) { if (groupSettings[gId].expireAt && groupSettings[gId].expireAt > now) targetGroups.push(gId); } }

                targetGroups =[...new Set(targetGroups)];
                if (targetGroups.length === 0) { await chat.sendMessage(`${botPrefix}❌ لم يتم العثور على أي جروبات متطابقة للإرسال إليها.`); return; }

                let successCount = 0, failCount = 0, successNames =[], failNames =[], media = null;
                if (msg.hasMedia) { try { media = await msg.downloadMedia(); } catch (e) {} }

                const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                for (const gId of targetGroups) {
                    let groupName = "جروب غير معروف";
                    const cachedChat = allChats.find(c => c.id._serialized === gId);
                    if (cachedChat && cachedChat.name) groupName = cachedChat.name;

                    try {
                        const targetChat = await client.getChatById(gId);
                        if (targetChat && targetChat.name) groupName = targetChat.name;
                        if (media) { await targetChat.sendMessage(media, { caption: broadcastText }); } else { await targetChat.sendMessage(broadcastText); }
                        successCount++; successNames.push(`✅ ${groupName}`);
                        await sleep(Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000);
                    } catch (err) { failCount++; failNames.push(`❌ ${groupName}`); }
                }

                let broadcastReport = `${botPrefix}📢 *تم الانتهاء من الإذاعة!*\n\n📊 *الإحصائيات:*\nالهدف: ${isGeneralBroadcast ? 'كل الجروبات' : 'الجروبات المفعلة'}\nنجح: ${successCount} | فشل: ${failCount}\n\n`;
                if (successNames.length > 0) broadcastReport += `🟢 *تم الاستلام في:*\n${successNames.join('\n')}\n\n`;
                if (failNames.length > 0) broadcastReport += `🔴 *فشل في (قد يكون مطروداً):*\n${failNames.join('\n')}`;

                await chat.sendMessage(broadcastReport);
                return;
            }

            if (text.startsWith('!تفعيل') || text.startsWith('!ايقاف') || text === '!فحص' || text.startsWith('!نظام')) {
                await chat.sendMessage(`${botPrefix}⚠️ عذراً، أوامر التفعيل والإيقاف يجب أن تُكتب داخل الجروب نفسه.\n\n*الأوامر المسموحة في الخاص:* \n- !كل الجروبات\n- !اذاعة [رسالتك]\n- !اذاعة عامة [رسالتك]`);
                return;
            }
        }

        // 🛑 إذا لم نكن في جروب، نتوقف هنا
        if (!chat.isGroup) return;

        const chatId = chat.id._serialized;

        // 🛡️ فحص صلاحيات البوت والمشرف 
        let botIsAdmin = false;
        try {
            const botNumber = client.info.wid.user; 
            botIsAdmin = chat.participants.some(p => p.id.user === botNumber && (p.isAdmin || p.isSuperAdmin));
        } catch(e) {}

        const isSenderAdmin = chat.participants.some(p => p.id.user === senderNumber && (p.isAdmin || p.isSuperAdmin));

        // 🌟 أمر كشف الصلاحيات (متاح للجميع)
        if (text === '!صلاحياتي') {
            await chat.sendMessage(
                `${botPrefix}🔍 *كشف الصلاحيات:*\n\n` +
                `👤 *رقمك:* ${senderNumber}\n` +
                `👑 *المالك (المدير العام)؟* ${isBotOwner ? 'نعم ✅' : 'لا ❌'}\n` +
                `🛡️ *مشرف (أدمن)؟* ${isSenderAdmin ? 'نعم ✅' : 'لا ❌'}\n` +
                `🤖 *هل البوت مشرف حالياً؟* ${botIsAdmin ? 'نعم ✅ (يستطيع الحذف والطرد)' : 'لا ❌ (لا يستطيع الحذف)'}`
            );
            return;
        }

        // الإعدادات المحدثة
        if (!groupSettings[chatId]) {
            groupSettings[chatId] = { 
                links: false, swear: false, merchant: false, stickers: false, 
                antiMention: false, linkAction: 'kick', expireAt: null, expiredNotified: false,
                antiBotAbuse: false, adminKickCmd: false
            };
        }

        // أوامر المالك الخاصة بالجروب
        if (isBotOwner) {
            
            // 🆕 المستويات الـ 3 للروابط والشتائم
            if (text === '!تفعيل الروابط للاعضاء') { groupSettings[chatId].links = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط على الأعضاء العاديين فقط.`); return; }
            if (text === '!تفعيل الروابط للكل') { groupSettings[chatId].links = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط على الجميع.`); return; }
            if (text === '!ايقاف الروابط') { groupSettings[chatId].links = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم السماح بالروابط للجميع.`); return; }
            
            if (text === '!تفعيل الشتائم للاعضاء') { groupSettings[chatId].swear = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تفعيل فلتر الشتائم للأعضاء فقط.`); return; }
            if (text === '!تفعيل الشتائم للكل') { groupSettings[chatId].swear = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تفعيل فلتر الشتائم للجميع.`); return; }
            if (text === '!ايقاف الشتائم') { groupSettings[chatId].swear = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف فلتر الشتائم.`); return; }

            // 🆕 أوامر حماية البوت والطرد
            if (text === '!تفعيل حماية البوت') { groupSettings[chatId].antiBotAbuse = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تفعيل طرد من يسب البوت.`); return; }
            if (text === '!ايقاف حماية البوت') { groupSettings[chatId].antiBotAbuse = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف حماية البوت.`); return; }

            if (text === '!تفعيل امر الطرد') { groupSettings[chatId].adminKickCmd = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تفعيل أمر (!طرد) للمشرفين.`); return; }
            if (text === '!ايقاف امر الطرد') { groupSettings[chatId].adminKickCmd = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف أمر (!طرد).`); return; }

            if (text === '!تفعيل التجار') { groupSettings[chatId].merchant = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل نظام توثيق التجار.`); return; }
            if (text === '!ايقاف التجار') { groupSettings[chatId].merchant = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام توثيق التجار.`); return; }
            if (text === '!تفعيل الملصقات') { groupSettings[chatId].stickers = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل صانع الملصقات.`); return; }
            if (text === '!ايقاف الملصقات') { groupSettings[chatId].stickers = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف صانع الملصقات.`); return; }
            if (text === '!تفعيل المنشن للاعضاء') { groupSettings[chatId].antiMention = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع المنشن (للكل) على الأعضاء العاديين فقط.`); return; }
            if (text === '!تفعيل المنشن للكل') { groupSettings[chatId].antiMention = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع المنشن (للكل) على الجميع.`); return; }
            if (text === '!ايقاف المنشن') { groupSettings[chatId].antiMention = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف منع المنشن.`); return; }
            if (text === '!نظام الروابط طرد') { groupSettings[chatId].linkAction = 'kick'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ تم ضبط نظام الروابط: (طرد بعد 3 إنذارات).`); return; }
            if (text === '!نظام الروابط حذف') { groupSettings[chatId].linkAction = 'deleteOnly'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ تم ضبط نظام الروابط: (حذف فقط بدون طرد).`); return; }

            if (text === '!تفعيل الكل') {
                const newExpireAt = Date.now() + (3650 * 24 * 60 * 60 * 1000);
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].links = 'members'; groupSettings[chatId].swear = 'members';
                groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                groupSettings[chatId].antiMention = 'members'; groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].antiBotAbuse = true; groupSettings[chatId].adminKickCmd = true;
                saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع الميزات** كباقة مدى الحياة!`); return;
            }

            if (text.startsWith('!تفعيل ')) {
                const parts = text.split(' ');
                const packageType = parts[1];
                let daysToAdd = 0; let packageName = "";

                if (packageType === '1') { daysToAdd = 5; packageName = "الفترة التجريبية (5 أيام)"; }
                else if (packageType === '2') { daysToAdd = 7; packageName = "باقة الأسبوع (7 أيام)"; }
                else if (packageType === '3') { daysToAdd = 30; packageName = "باقة الشهر (30 يوم)"; }
                else { return; } 

                const newExpireAt = Date.now() + (daysToAdd * 24 * 60 * 60 * 1000);
                groupSettings[chatId].expireAt = newExpireAt; groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].links = 'members'; groupSettings[chatId].swear = 'members';
                groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                groupSettings[chatId].antiMention = 'members'; 
                groupSettings[chatId].antiBotAbuse = true; groupSettings[chatId].adminKickCmd = true;
                saveSettings();
                await chat.sendMessage(`✅ *تم تفعيل البوت!*\n📦 *الباقة:* ${packageName}\n🛑 *ينتهي:* ${formatDate(newExpireAt)}`); return;
            }

            if (text === '!ايقاف الكل' || text === '!الغاء الاشتراك' || text === '!ايقاف الاشتراك') {
                groupSettings[chatId].expireAt = Date.now() - 1000; groupSettings[chatId].expiredNotified = true; 
                groupSettings[chatId].links = false; groupSettings[chatId].swear = false;
                groupSettings[chatId].merchant = false; groupSettings[chatId].stickers = false;
                groupSettings[chatId].antiMention = false; groupSettings[chatId].antiBotAbuse = false; groupSettings[chatId].adminKickCmd = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات وإلغاء الاشتراك بنجاح.`); return;
            }

            if (text === '!فحص') {
                let subStatus = "منتهي ❌";
                if (groupSettings[chatId].expireAt && groupSettings[chatId].expireAt > Date.now()) {
                    const daysLeft = Math.ceil((groupSettings[chatId].expireAt - Date.now()) / (1000 * 60 * 60 * 24));
                    subStatus = `مفعل (${daysLeft} يوم متبقي)\nينتهي: ${formatDate(groupSettings[chatId].expireAt)}`;
                }
                const linkSys = groupSettings[chatId].linkAction === 'deleteOnly' ? 'حذف فقط' : 'طرد';
                const formatStatus = (val) => val === 'all' ? '✅ للكل' : (val === 'members' || val === true ? '✅ للاعضاء' : '❌');
                
                await chat.sendMessage(`${botPrefix}📊 تقرير شامل للجروب:\n\n*الاشتراك:* ${subStatus}\n*نظام الروابط:* ${linkSys}\n\n*الميزات النشطة:*\nالروابط: ${formatStatus(groupSettings[chatId].links)}\nالشتائم: ${formatStatus(groupSettings[chatId].swear)}\nالمنشن: ${formatStatus(groupSettings[chatId].antiMention)}\nالتجار: ${groupSettings[chatId].merchant ? '✅' : '❌'} | الملصقات: ${groupSettings[chatId].stickers ? '✅' : '❌'}\nحماية البوت: ${groupSettings[chatId].antiBotAbuse ? '✅' : '❌'} | أمر الطرد: ${groupSettings[chatId].adminKickCmd ? '✅' : '❌'}`); return;
            }
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

        // =========================================
        // 🌟 أوامر الأعضاء
        // =========================================
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        
        const isolatedUserKey = `${chatId}_${senderId}`; 
        
        if (text === '!انذاراتي') {
            const count = userWarnings[isolatedUserKey] || 0;
            const max = settings.linkAction === 'deleteOnly' ? 'غير محدود (حذف فقط)' : '3';
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ إنذاراتك في الجروب: ${count} / ${max}`, { mentions:[senderId] }); return;
        }

        // أمر قائمة الشتائم
        if (text === '!قائمة الشتائم') {
            let leaderboard =[];
            for (const key in swearStats) {
                if (key.startsWith(chatId)) { 
                    const uId = key.split('_')[1];
                    leaderboard.push({ id: uId, count: swearStats[key] });
                }
            }
            if (leaderboard.length === 0) {
                await chat.sendMessage(`${botPrefix}📜 الجروب نظيف! لم يقم أحد بالسب حتى الآن.`);
                return;
            }
            leaderboard.sort((a, b) => b.count - a.count); 
            let msgText = `${botPrefix}📜 *قائمة أكثر الأعضاء مخالفة (الشتائم):*\n\n`;
            let mentionsList =[];
            for (let i = 0; i < Math.min(leaderboard.length, 10); i++) { 
                msgText += `${i + 1}. العضو (@${leaderboard[i].id.split('@')[0]}) : ${leaderboard[i].count} مرة\n`;
                mentionsList.push(leaderboard[i].id);
            }
            await chat.sendMessage(msgText, { mentions: mentionsList });
            return;
        }

        if (text === '!ملصق' && settings.stickers) {
            try {
                let targetMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage() : msg;
                if (targetMsg.hasMedia) {
                    const media = await targetMsg.downloadMedia();
                    if (media && (media.mimetype === 'image/jpeg' || media.mimetype === 'image/png' || media.mimetype === 'image/webp')) {
                        await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير' });
                    }
                }
            } catch (error) {}
            return;
        }

        if (settings.merchant) {
            const userKey = `${chatId}_SPLIT_${senderId}`;
            if (pendingMerchants[userKey]) {
                const mentions = await msg.getMentions();
                if (mentions && mentions.length > 0) {
                    const uniqueMentions =[...new Set(mentions.map(m => m.id._serialized))];
                    if (uniqueMentions.length >= 5) {
                        clearTimeout(pendingMerchants[userKey].warningTimer); clearTimeout(pendingMerchants[userKey].kickTimer);
                        delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                        await chat.sendMessage(`${botPrefix}✅ تم توثيقك كتاجر معتمد.`);
                    }
                }
            }
        }

        // =========================================
        // 🚨 ميزة أمر الطرد اليدوي (للمشرفين والمالك)
        // =========================================
        if (settings.adminKickCmd && text === '!طرد' && (isSenderAdmin || isBotOwner)) {
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const targetId = quotedMsg.author || quotedMsg.from;
                if (botIsAdmin) {
                    try {
                        await chat.removeParticipants([targetId]);
                        await chat.sendMessage(`${botPrefix}✅ تم تنفيذ أمر الطرد بنجاح بواسطة المشرف (@${senderNumber}).`, { mentions:[senderId] });
                    } catch (e) {}
                } else {
                    await msg.reply(`${botPrefix}⚠️ لا أمتلك صلاحية الإشراف لطرد العضو.`);
                }
            } else {
                await msg.reply(`${botPrefix}⚠️ للاستخدام: قم بالرد (Reply) على رسالة الشخص واكتب !طرد`);
            }
            return;
        }

        // =========================================
        // 🚨 ميزة حماية البوت (Anti-Bot Abuse)
        // =========================================
        if (settings.antiBotAbuse && msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            let botIdStr = "";
            try { botIdStr = client.info.wid._serialized; } catch(e){}
            
            if (botIdStr && (quotedMsg.fromMe || quotedMsg.author === botIdStr || quotedMsg.from === botIdStr) && containsBadWordSmart(msg.body)) {
                if (botIsAdmin) {
                    try {
                        await msg.delete(true);
                        await chat.removeParticipants([senderId]);
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${senderNumber}) فوراً بسبب التعدي اللفظي على نظام البوت.`, { mentions:[senderId] });
                    } catch (e) {}
                } else {
                    await chat.sendMessage(`${botPrefix}⚠️ العضو (@${senderNumber}) يسب البوت! يرجى طرده (البوت ليس مشرفاً).`, { mentions: [senderId] });
                }
                return; 
            }
        }

        // =========================================
        // ⚔️ العقوبات لباقي الميزات
        // =========================================
        const isImmune = isSenderAdmin; 

        if (isSpamming(senderId)) {
            if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} }
            if (spamTracker[senderId].count === SPAM_LIMIT + 1) {
                await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nالرجاء التوقف عن الإرسال المتكرر السريع (Spam).`, { mentions:[senderId] });
            }
            return; 
        }

        // نظام منع منشن @الكل المُحدّث
        if (settings.antiMention) {
            const hasAllTag = text.includes('@الكل') || text.includes('@all') || text.includes('@everyone');
            if (hasAllTag) {
                let shouldStrike = false; let targetString = '';
                if (settings.antiMention === 'all') { shouldStrike = true; targetString = 'نهائياً لأي شخص'; } 
                else if ((settings.antiMention === 'members' || settings.antiMention === true) && !isImmune) { shouldStrike = true; targetString = 'للأعضاء'; }

                if (shouldStrike) {
                    let deleted = false;
                    if (botIsAdmin) { try { await msg.delete(true); deleted = true; } catch (error) {} }
                    
                    if(deleted) {
                        await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع استخدام منشن (@الكل) ${targetString} في هذا الجروب.`, { mentions:[senderId] });
                    } else {
                        await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع استخدام منشن (@الكل).\n(يرجى رفع البوت مشرف ليتمكن من الحذف)`, { mentions:[senderId] });
                    }
                    return; 
                }
            }
        }

        if (settings.swear) {
            let shouldStrike = false;
            if (settings.swear === 'all') shouldStrike = true;
            else if ((settings.swear === 'members' || settings.swear === true) && !isImmune) shouldStrike = true;

            if (shouldStrike && containsBadWordSmart(msg.body)) {
                let deleted = false;
                if (botIsAdmin) { try { await msg.delete(true); deleted = true;} catch (error) {} }
                
                swearStats[isolatedUserKey] = (swearStats[isolatedUserKey] || 0) + 1; saveSwearStats();

                if(deleted){
                     await chat.sendMessage(`${botPrefix}⚠️ ثكلتك أمك يا (@${senderNumber})!\nقال رسول الله ﷺ: «لَيْسَ المُؤْمِنُ بِالطَّعَّانِ وَلَا اللَّعَّانِ وَلَا الفَاحِشِ وَلَا البَذِيءِ».`, { mentions:[senderId] });
                } else {
                     await chat.sendMessage(`${botPrefix}⚠️ الشتائم ممنوعة يا (@${senderNumber})!\n(يرجى رفع البوت مشرف ليتمكن من الحذف)`, { mentions:[senderId] });
                }
                return;
            }
        }

        if (settings.links && /(https?:\/\/[^\s]+)/i.test(msg.body)) {
            let shouldStrike = false;
            if (settings.links === 'all') shouldStrike = true;
            else if ((settings.links === 'members' || settings.links === true) && !isImmune) shouldStrike = true;

            if (shouldStrike) {
                let deleted = false;
                if (botIsAdmin) { try { await msg.delete(true); deleted = true; } catch (error) {} }
                
                if (settings.linkAction === 'deleteOnly') {
                    if(deleted){
                        await chat.sendMessage(`${botPrefix}⚠️ يُمنع إرسال الروابط يا (@${senderNumber})! تم حذف رسالتك.`, { mentions:[senderId] });
                    } else {
                        await chat.sendMessage(`${botPrefix}⚠️ يُمنع إرسال الروابط يا (@${senderNumber})!\n(لم أتمكن من الحذف لأنني لست مشرفاً).`, { mentions:[senderId] });
                    }
                } else {
                    userWarnings[isolatedUserKey] = (userWarnings[isolatedUserKey] || 0) + 1; saveWarnings();
                    const warningsCount = userWarnings[isolatedUserKey];

                    if (warningsCount < 3) {
                        if(deleted){
                            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع الروابط.\nإنذار ${warningsCount} من 3.`, { mentions:[senderId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nإنذار ${warningsCount} من 3.\n(يرجى رفع البوت مشرف ليتمكن من الحذف)`, { mentions:[senderId] });
                        }
                    } else {
                        let isKicked = false;
                        if (botIsAdmin) {
                            try { await chat.removeParticipants([senderId]); isKicked = true; userWarnings[isolatedUserKey] = 0; saveWarnings(); } catch (error) {}
                        }
                        
                        if (isKicked) {
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه 3 إنذارات للروابط.`, { mentions:[senderId] });
                        } else {
                            await chat.sendMessage(`${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 إنذارات!\n(البوت منزوع الصلاحيات، يرجى من المشرفين طرده).`, { mentions:[senderId] });
                        }
                    }
                }
            }
        }

    } catch (err) {
        console.error('❌ خطأ في معالجة الرسالة:', err.message);
    }
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
