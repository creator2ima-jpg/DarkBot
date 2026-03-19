const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =========================================
// 🌐 خادم الويب (لمنع التوقف التلقائي)
// =========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('البوت يعمل بنجاح! Uptime Monitor is Active.'); });
app.listen(PORT, () => { console.log(`🌍 خادم الويب يعمل على المنفذ ${PORT}`); });

// =========================================
// 🗄️ 1. نظام الذاكرة الدائمة
// =========================================
const dataPath = fs.existsSync('/data') ? '/data' : __dirname;
const dbFile = path.join(dataPath, 'warnings.json');
const settingsFile = path.join(dataPath, 'settings.json');
const merchantsFile = path.join(dataPath, 'merchants.json');
const swearStatsFile = path.join(dataPath, 'swear_stats.json'); // ملف جديد لعداد الشتائم

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
let groupSettings = safeReadJSON(settingsFile);
let swearCounts = safeReadJSON(swearStatsFile);
let pendingMerchantsData = safeReadJSON(merchantsFile);
const pendingMerchants = {};

function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }
function saveSwearCounts() { fs.writeFileSync(swearStatsFile, JSON.stringify(swearCounts, null, 2)); }
function saveMerchants() {
    const toSave = {};
    for (const key in pendingMerchants) { toSave[key] = pendingMerchants[key].expireTime; }
    fs.writeFileSync(merchantsFile, JSON.stringify(toSave, null, 2));
}

function clearChromiumCache() {
    try {
        const basePath = path.join(dataPath, '.wwebjs_auth', 'session', 'Default');
        ['Cache', 'Code Cache', path.join('Service Worker', 'CacheStorage')].forEach(p => {
            const cachePath = path.join(basePath, p);
            if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });
        });
    } catch (err) {}
}
clearChromiumCache();

// =========================================
// 🚫 2. نظام Anti-Spam
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
    clearChromiumCache();
}, 24 * 60 * 60 * 1000);

// =========================================
// 👑 3. أرقام المالكين
// =========================================
const MY_ADMIN_NUMBERS = ["201092996413", "201091885491", "27041768431630"];

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

// =========================================
// 🚀 4. إعدادات البوت والاتصال 
// =========================================
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "DarkBot-V2", dataPath: dataPath }),
    puppeteer: {ٍ
        headless: true,
        args:[
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu',
            '--js-flags="--max-old-space-size=250"', '--disk-cache-size=1',                
            '--disable-application-cache', '--disable-offline-load-stale-cache',
            '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('🔗 امسك الهاتف وامسح الـ QR');
});

client.on('ready', () => {
    console.log('✅ البوت جاهز ومستقر ويعمل الآن.');
    restoreMerchantTimers();
});

let isReconnecting = false;
client.on('disconnected', async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 انقطع الاتصال، إعادة التشغيل...');
    try { await client.destroy(); } catch (err) {}
    setTimeout(async () => {
        try { await client.initialize(); } catch (err) {}
        isReconnecting = false;
    }, 5000);
});

// =========================================
// ⚙️ 5. إعدادات القوانين 
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
// 🛡️ 6. نظام توثيق التجار وسجل المشرفين
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
            if (remaining - (3 * 60 * 1000) > 0) {
                warningTimer = setTimeout(async () => {
                    if (pendingMerchants[userKey]) {
                        try {
                            const chat = await client.getChatById(chatId);
                            await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userId.split('@')[0]})!\nمتبقي 3 دقائق فقط لعمل منشن لـ 5 تجار!`, { mentions: [userId] });
                        } catch (err) {}
                    }
                }, remaining - (3 * 60 * 1000));
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
            await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

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

// 🟢 ميزة: سجل المشرفين (ترقية وتنزيل)
client.on('group_admin_changed', async (notification) => {
    try {
        const chatId = notification.chatId;
        const settings = groupSettings[chatId];
        if (!settings || !settings.expireAt || Date.now() > settings.expireAt) return;

        const chat = await client.getChatById(chatId);
        const authorNum = notification.author.split('@')[0];
        const timeNow = formatDate(Date.now());

        for (const adminId of notification.recipientIds) {
            const targetNum = adminId.split('@')[0];
            if (notification.action === 'promote') {
                await chat.sendMessage(`${botPrefix}👑 *ترقية إدارية*\n👤 قام المشرف: (@${authorNum})\n⭐ بترقية العضو: (@${targetNum})\n⏰ الوقت: ${timeNow}`, { mentions:[notification.author, adminId] });
            } else if (notification.action === 'demote') {
                await chat.sendMessage(`${botPrefix}⬇️ *سحب إشراف*\n👤 قام المشرف: (@${authorNum})\n❌ بسحب الإشراف من: (@${targetNum})\n⏰ الوقت: ${timeNow}`, { mentions:[notification.author, adminId] });
            }
        }
    } catch (err) {}
});

// =========================================
// 📩 7. نظام استقبال الرسائل والأوامر
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

        if (!chat.isGroup && !isBotOwner) return;

        // =========================================
        // 🌐 أوامر المالك العامة (اذاعة وغيرها)
        // =========================================
        if (isBotOwner) {
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
                    await chat.sendMessage(`${botPrefix}⚠️ خطأ! يرجى كتابة الرسالة أو إرفاق صورة/فيديو مع الأمر.`); return;
                }
                await chat.sendMessage(`${botPrefix}⏳ جاري الإذاعة ببطء لتجنب الحظر...`);
                let targetGroups = [];
                let allChats =[];
                try { allChats = await client.getChats(); } catch(e) {}
                if (isGeneralBroadcast) { targetGroups = allChats.filter(c => c.isGroup).map(c => c.id._serialized); } 
                else {
                    const now = Date.now();
                    for (const gId in groupSettings) { if (groupSettings[gId].expireAt && groupSettings[gId].expireAt > now) targetGroups.push(gId); }
                }
                targetGroups =[...new Set(targetGroups)];
                if (targetGroups.length === 0) { await chat.sendMessage(`❌ لم يتم العثور على جروبات.`); return; }

                let successCount = 0, failCount = 0; let successNames =[], failNames =[];
                let media = null;
                if (msg.hasMedia) { try { media = await msg.downloadMedia(); } catch (e) {} }
                const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

                for (const gId of targetGroups) {
                    let groupName = "جروب غير معروف";
                    const cachedChat = allChats.find(c => c.id._serialized === gId);
                    if (cachedChat && cachedChat.name) groupName = cachedChat.name;
                    try {
                        const targetChat = await client.getChatById(gId);
                        if (targetChat && targetChat.name) groupName = targetChat.name;
                        if (media) await targetChat.sendMessage(media, { caption: broadcastText });
                        else await targetChat.sendMessage(broadcastText);
                        successCount++; successNames.push(`✅ ${groupName}`);
                        await sleep(Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000);
                    } catch (err) { failCount++; failNames.push(`❌ ${groupName}`); }
                }
                await chat.sendMessage(`${botPrefix}📢 *تم الانتهاء!*\nنجح: ${successCount} | فشل: ${failCount}`); return;
            }

            if (!chat.isGroup && (text.startsWith('!تفعيل') || text.startsWith('!ايقاف') || text === '!فحص')) {
                await chat.sendMessage(`${botPrefix}⚠️ عذراً، أوامر التفعيل والإيقاف يجب أن تُكتب داخل الجروب نفسه.`); return;
            }
        }

        if (!chat.isGroup) return;

        const chatId = chat.id._serialized;
        let botIsAdmin = false;
        try {
            const botId = client.info.wid._serialized.replace(/:\d+/, "");
            botIsAdmin = chat.participants.some(p => p.id._serialized === botId && (p.isAdmin || p.isSuperAdmin));
        } catch(e) {}

        const isSenderAdmin = chat.participants.some(p => p.id._serialized === senderId && (p.isAdmin || p.isSuperAdmin));

        if (!groupSettings[chatId]) {
            // 🟢 إعدادات V2 الشاملة
            groupSettings[chatId] = { 
                links: 'members', swear: 'members', merchant: false, stickers: false, 
                antiMention: 'members', linkAction: 'kick', botProtect: false, expireAt: null, expiredNotified: false 
            };
        }

        const settings = groupSettings[chatId];

        // =========================================
        // 🌟 أوامر الإدارة (للمالكين والمشرفين)
        // =========================================
        if (isBotOwner || isSenderAdmin) {
            
            // 🟢 ميزة: أمر الطرد بالرد
            if (text === '!طرد') {
                if (!botIsAdmin) { await chat.sendMessage(`${botPrefix}❌ البوت ليس مشرفاً!`); return; }
                if (msg.hasQuotedMsg) {
                    const quotedMsg = await msg.getQuotedMessage();
                    const targetId = quotedMsg.author || quotedMsg.from;
                    if (targetId) {
                        try {
                            await chat.removeParticipants([targetId]);
                            await chat.sendMessage(`${botPrefix}👋 تم طرد العضو بناءً على طلب المشرف.`, { mentions:[targetId] });
                        } catch(e) {}
                    }
                } else {
                    await chat.sendMessage(`${botPrefix}⚠️ يجب عمل "رد" (Reply) على رسالة العضو المراد طرده وكتابة !طرد`);
                }
                return;
            }

            // 🟢 ميزة: قائمة الشتائم
            if (text === '!قائمة الشتائم' || text === '!قائمه الشتائم') {
                if (!swearCounts[chatId] || Object.keys(swearCounts[chatId]).length === 0) {
                    await chat.sendMessage(`${botPrefix}✨ الجروب نظيف، لا توجد شتائم مسجلة.`); return;
                }
                const sorted = Object.entries(swearCounts[chatId]).sort((a, b) => b[1] - a[1]).slice(0, 10);
                let report = `${botPrefix}📜 *قائمة أكثر الأعضاء مخالفة (شتائم):*\n\n`;
                let mentions = [];
                sorted.forEach(([uid, count], index) => {
                    const num = uid.split('@')[0];
                    report += `${index + 1}. (@${num}) ➔ ${count} شتيمة\n`;
                    mentions.push(uid);
                });
                await chat.sendMessage(report, { mentions: mentions });
                return;
            }
        }

        // أوامر خاصة بالمالك فقط (التحكم في الميزات)
        if (isBotOwner) {
            if (text === '!صلاحياتي') { await chat.sendMessage(`${botPrefix}🔍 *كشف الصلاحيات:*\n👤 *رقمك:* ${senderNumber}\n👑 *المالك؟* ${isBotOwner ? 'نعم ✅' : 'لا ❌'}\n🛡️ *مشرف؟* ${isSenderAdmin ? 'نعم ✅' : 'لا ❌'}`); return; }
            
            // الروابط
            if (text === '!تفعيل الروابط للاعضاء') { settings.links = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط للأعضاء العاديين فقط.`); return; }
            if (text === '!تفعيل الروابط للكل') { settings.links = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الروابط للجميع (حتى المشرفين).`); return; }
            if (text === '!ايقاف الروابط') { settings.links = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام مكافحة الروابط.`); return; }
            if (text === '!نظام الروابط طرد') { settings.linkAction = 'kick'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ نظام الروابط: (طرد بعد 3 إنذارات).`); return; }
            if (text === '!نظام الروابط حذف') { settings.linkAction = 'deleteOnly'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ نظام الروابط: (حذف فقط بدون طرد).`); return; }

            // الشتائم
            if (text === '!تفعيل الشتائم للاعضاء') { settings.swear = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الشتائم للأعضاء العاديين فقط.`); return; }
            if (text === '!تفعيل الشتائم للكل') { settings.swear = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع الشتائم للجميع (حتى المشرفين).`); return; }
            if (text === '!ايقاف الشتائم') { settings.swear = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف فلتر الشتائم.`); return; }

            // حماية البوت
            if (text === '!تفعيل حماية البوت') { settings.botProtect = true; saveSettings(); await chat.sendMessage(`${botPrefix}🛡️ تم تفعيل نظام حماية البوت (الطرد لمن يسب البوت).`); return; }
            if (text === '!ايقاف حماية البوت') { settings.botProtect = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام حماية البوت.`); return; }

            // المنشن والتجار والملصقات
            if (text === '!تفعيل المنشن للاعضاء') { settings.antiMention = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع منشن الكل للأعضاء.`); return; }
            if (text === '!تفعيل المنشن للكل') { settings.antiMention = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم منع منشن الكل للجميع.`); return; }
            if (text === '!ايقاف المنشن') { settings.antiMention = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم السماح بمنشن الكل.`); return; }
            
            if (text === '!تفعيل التجار') { settings.merchant = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل نظام توثيق التجار.`); return; }
            if (text === '!ايقاف التجار') { settings.merchant = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام توثيق التجار.`); return; }
            if (text === '!تفعيل الملصقات') { settings.stickers = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل صانع الملصقات.`); return; }
            if (text === '!ايقاف الملصقات') { settings.stickers = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف صانع الملصقات.`); return; }

            if (text === '!تفعيل الكل') {
                settings.expireAt = Date.now() + (3650 * 24 * 60 * 60 * 1000);
                settings.links = 'members'; settings.swear = 'members';
                settings.merchant = true; settings.stickers = true;
                settings.antiMention = 'members'; settings.botProtect = true;
                settings.expiredNotified = false; saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع الميزات** كباقة مدى الحياة!`); return;
            }

            if (text.startsWith('!تفعيل ')) {
                const parts = text.split(' '); const packageType = parts[1];
                let daysToAdd = 0; let packageName = "";
                if (packageType === '1') { daysToAdd = 5; packageName = "الفترة التجريبية (5 أيام)"; }
                else if (packageType === '2') { daysToAdd = 7; packageName = "باقة الأسبوع (7 أيام)"; }
                else if (packageType === '3') { daysToAdd = 30; packageName = "باقة الشهر (30 يوم)"; }
                else return; 
                settings.expireAt = Date.now() + (daysToAdd * 24 * 60 * 60 * 1000);
                settings.links = 'members'; settings.swear = 'members'; settings.merchant = true; 
                settings.stickers = true; settings.antiMention = 'members'; settings.botProtect = true;
                settings.expiredNotified = false; saveSettings();
                await chat.sendMessage(`✅ *تم تفعيل البوت!*\n📦 *الباقة:* ${packageName}\n🛑 *ينتهي:* ${formatDate(settings.expireAt)}`); return;
            }

            if (text === '!ايقاف الكل' || text === '!الغاء الاشتراك' || text === '!ايقاف الاشتراك') {
                settings.expireAt = Date.now() - 1000; settings.expiredNotified = true; 
                settings.links = false; settings.swear = false; settings.merchant = false; 
                settings.stickers = false; settings.antiMention = false; settings.botProtect = false; saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات وإلغاء الاشتراك بنجاح.`); return;
            }

            // 🟢 ميزة: تقرير !فحص المحدث
            if (text === '!فحص') {
                let subStatus = "منتهي ❌";
                if (settings.expireAt && settings.expireAt > Date.now()) {
                    const daysLeft = Math.ceil((settings.expireAt - Date.now()) / (1000 * 60 * 60 * 24));
                    subStatus = `مفعل (${daysLeft} يوم متبقي)\nينتهي: ${formatDate(settings.expireAt)}`;
                }
                const linkSys = settings.linkAction === 'deleteOnly' ? 'حذف فقط' : 'طرد (3 إنذارات)';
                
                const formatStatus = (val) => val === 'all' ? '✅ للكل' : (val === 'members' || val === true ? '✅ للأعضاء' : '❌ معطل');
                
                await chat.sendMessage(`${botPrefix}📊 تقرير شامل للجروب:\n\n*الاشتراك:* ${subStatus}\n*عقوبة الروابط:* ${linkSys}\n\n*حالة الأنظمة:*\n🔗 الروابط: ${formatStatus(settings.links)}\n🤬 الشتائم: ${formatStatus(settings.swear)}\n📢 منشن الكل: ${formatStatus(settings.antiMention)}\n🛡️ حماية البوت: ${settings.botProtect ? '✅' : '❌'}\n🤝 التجار: ${settings.merchant ? '✅' : '❌'}\n🖼️ الملصقات: ${settings.stickers ? '✅' : '❌'}`); return;
            }
        }

        // =========================================
        // 🛑 البوابة الحديدية للاشتراكات
        // =========================================
        if (!settings.expireAt) return; 
        if (Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                settings.expiredNotified = true; saveSettings(); 
                try { await chat.sendMessage(`⚠️ انتهى اشتراك البوت في الجروب. يرجى التجديد.`); } catch (e) {}
            }
            return; 
        }

        // =========================================
        // 🌟 أوامر الأعضاء والخدمات
        // =========================================
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        
        const isolatedUserKey = `${chatId}_${senderId}`; 
        
        if (text === '!انذاراتي') {
            const count = userWarnings[isolatedUserKey] || 0;
            const max = settings.linkAction === 'deleteOnly' ? 'غير محدود (حذف فقط)' : '3';
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ إنذاراتك (روابط): ${count} / ${max}`, { mentions:[senderId] }); return;
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
        // 🚨 العقوبات والحماية
        // =========================================
        if (isSpamming(senderId)) { if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} } return; }

        // منع المنشن الجماعي
        if (settings.antiMention) {
            const hasAllTag = text.includes('@الكل') || text.includes('@all') || text.includes('@everyone');
            if (hasAllTag) {
                let shouldStrike = (settings.antiMention === 'all') || ((settings.antiMention === 'members' || settings.antiMention === true) && !isSenderAdmin);
                if (shouldStrike) {
                    if (botIsAdmin) { try { await msg.delete(true); } catch (error) {} }
                    await chat.sendMessage(`${botPrefix}⚠️ يُمنع استخدام منشن (الكل) هنا!`, { mentions:[senderId] });
                    return; 
                }
            }
        }

        // 🟢 ميزة: حماية البوت من الإهانة
        if (settings.botProtect && msg.hasQuotedMsg && containsBadWordSmart(msg.body)) {
            const quotedMsg = await msg.getQuotedMessage();
            let botIdRaw = "";
            try { botIdRaw = client.info.wid._serialized; } catch(e) {}
            
            if (quotedMsg.fromMe || (quotedMsg.author && quotedMsg.author === botIdRaw) || (quotedMsg.from && quotedMsg.from === botIdRaw)) {
                if (!isSenderAdmin) {
                    if (botIsAdmin) {
                        try {
                            await chat.removeParticipants([senderId]);
                            await chat.sendMessage(`${botPrefix}🚫 **تم الطرد**\nالسبب: التعدي اللفظي على نظام البوت.`, { mentions:[senderId] });
                        } catch(e) {}
                    }
                    return; // نوقف التنفيذ عشان ميتعاقبش عقاب الشتيمة العادية
                }
            }
        }

        // فلتر الشتائم مع العداد
        if (settings.swear) {
            let strikeSwear = (settings.swear === 'all') || ((settings.swear === 'members' || settings.swear === true) && !isSenderAdmin);
            if (strikeSwear && containsBadWordSmart(msg.body)) {
                if (botIsAdmin) { try { await msg.delete(true); } catch (error) {} }
                
                // تسجيل الشتيمة في العداد
                if (!swearCounts[chatId]) swearCounts[chatId] = {};
                swearCounts[chatId][senderId] = (swearCounts[chatId][senderId] || 0) + 1;
                saveSwearCounts();

                await chat.sendMessage(`${botPrefix}⚠️ ثكلتك أمك يا (@${senderNumber})!\nقال رسول الله ﷺ: «لَيْسَ المُؤْمِنُ بِالطَّعَّانِ وَلَا اللَّعَّانِ وَلَا الفَاحِشِ وَلَا البَذِيءِ».`, { mentions:[senderId] });
                return;
            }
        }

        // فلتر الروابط
        if (settings.links && /(https?:\/\/[^\s]+)/i.test(msg.body)) {
            let strikeLink = (settings.links === 'all') || ((settings.links === 'members' || settings.links === true) && !isSenderAdmin);
            if (strikeLink) {
                if (botIsAdmin) { try { await msg.delete(true); } catch (error) {} }
                
                if (settings.linkAction === 'deleteOnly') {
                    await chat.sendMessage(`${botPrefix}⚠️ يُمنع إرسال الروابط يا (@${senderNumber})! تم الحذف.`, { mentions:[senderId] });
                } else {
                    userWarnings[isolatedUserKey] = (userWarnings[isolatedUserKey] || 0) + 1; saveWarnings();
                    const warningsCount = userWarnings[isolatedUserKey];

                    if (warningsCount < 3) {
                        await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع الروابط.\nإنذار ${warningsCount} من 3.`, { mentions:[senderId] });
                    } else {
                        if (botIsAdmin) {
                            try { await chat.removeParticipants([senderId]); userWarnings[isolatedUserKey] = 0; saveWarnings(); } catch (error) {}
                            await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه 3 إنذارات للروابط.`, { mentions: [senderId] });
                        }
                    }
                }
            }
        }

    } catch (err) {}
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
