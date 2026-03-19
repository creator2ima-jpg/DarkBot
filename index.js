const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =========================================
// 🌐 خادم الويب (بقاء السيرفر مستيقظاً)
// =========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('البوت يعمل بنجاح! Uptime Monitor is Active.'); });
app.listen(PORT, () => { console.log(`🌍 خادم الويب يعمل على المنفذ ${PORT}`); });

// =========================================
// 🗄️ 1. نظام الذاكرة الدائمة
// =========================================
const dataPath = __dirname;
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
    } catch (e) { console.error(`خطأ في قراءة ${filePath}:`, e.message); }
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

// =========================================
// 🧠 2. النظام الذكي (التنظيف الذاتي والمراقبة)
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

// المكنسة الذاتية تعمل كل 12 ساعة لتفريغ الذاكرة
setInterval(() => {
    console.log('[النظام الذكي] 🧹 جاري تنفيذ دورة التنظيف الذاتي للذاكرة...');
    let changed = false;
    for (const key in userWarnings) {
        if (userWarnings[key] === 0) { delete userWarnings[key]; changed = true; }
    }
    if (changed) saveWarnings();
    for (const key in spamTracker) { delete spamTracker[key]; }
}, 12 * 60 * 60 * 1000);

// مراقب الرامات يعمل كل 30 دقيقة للاطمئنان
setInterval(() => {
    const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    console.log(`[النظام الذكي] 📊 استهلاك الرامات الحالي: ${memoryUsage} MB (مستقر)`);
}, 30 * 60 * 1000);

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
// 🚀 4. إعدادات المتصفح (الخنق المبرمج للرامات)
// =========================================
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "DarkBot-V2", dataPath: dataPath }),
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
            '--js-flags="--max-old-space-size=250"', // تحديد الرامات إجبارياً
            '--disk-cache-size=1', // منع تخزين الملفات المؤقتة
            '--media-cache-size=1', // منع تخزين الميديا
            '--disable-extensions', // إيقاف الإضافات
            '--disable-default-apps',
            '--disable-background-networking', // إيقاف تحديثات كروم الخلفية
            '--mute-audio' // كتم الصوت لتوفير المعالجة
        ]
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('🔗 امسك الهاتف وامسح الـ QR...');
});

client.on('ready', () => {
    console.log('✅ البوت جاهز ومستقر ويعمل الآن بوضع توفير الطاقة.');
    restoreMerchantTimers();
});

let isReconnecting = false;
client.on('disconnected', async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 انقطع الاتصال، إعادة التشغيل الذاتي...');
    try { await client.destroy(); } catch (err) {}
    setTimeout(async () => {
        try { await client.initialize(); } catch (err) {}
        isReconnecting = false;
    }, 5000);
});

// =========================================
// ⚙️ 5. القوانين والكلمات الممنوعة
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
// 🛡️ 6. نظام التجار وسجل المشرفين
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
                        }
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, remaining);
            pendingMerchants[userKey] = { kickTimer, expireTime };
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
            const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\nأمامك (30 دقيقة) لإثبات أنك تاجر. قم بعمل (منشن @) لـ 5 تجار.\n⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.`;
            await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

            const userKey = `${chatId}_SPLIT_${joinedUserId}`;
            const expireTime = Date.now() + (30 * 60 * 1000); 

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

            pendingMerchants[userKey] = { kickTimer, expireTime };
            pendingMerchantsData[userKey] = expireTime; saveMerchants();
        }
    } catch (error) {}
});

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
                await chat.sendMessage(`${botPrefix}👑 *ترقية إدارية*\n👤 المشرف: (@${authorNum})\n⭐ رقّى العضو: (@${targetNum})\n⏰ الوقت: ${timeNow}`, { mentions:[notification.author, adminId] });
            } else if (notification.action === 'demote') {
                await chat.sendMessage(`${botPrefix}⬇️ *سحب إشراف*\n👤 المشرف: (@${authorNum})\n❌ سحب من: (@${targetNum})\n⏰ الوقت: ${timeNow}`, { mentions:[notification.author, adminId] });
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

        try { const contact = await msg.getContact(); if (contact && contact.number) senderNumber = contact.number.replace(/\D/g, ""); } catch(e) {}

        const text = msg.body.trim();
        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber) || MY_ADMIN_NUMBERS.some(admin => senderNumber.endsWith(admin));

        console.log(`[رادار] رسالة: "${text.substring(0,20)}..." | المالك؟ ${isBotOwner} | الجروب؟ ${chat.isGroup}`);

        if (!chat.isGroup && !isBotOwner) return;

        if (isBotOwner) {
            if (text === '!كل الجروبات' || text === '!الجروبات') {
                await chat.sendMessage(`${botPrefix}⏳ جاري جمع البيانات...`);
                const now = Date.now();
                let report = `${botPrefix}📋 *الجروبات المسجلة:*\n\n`;
                let active = 0, expired = 0;
                let allChats =[]; try { allChats = await client.getChats(); } catch(e) {}
                for (const gId in groupSettings) {
                    const gs = groupSettings[gId]; if (!gs.expireAt) continue;
                    let groupName = "غير معروف";
                    const targetChat = allChats.find(c => c.id._serialized === gId); if (targetChat && targetChat.name) groupName = targetChat.name;
                    if (gs.expireAt > now) { active++; report += `🟢 ${groupName} (مفعل)\n`; } else { expired++; report += `🔴 ${groupName} (منتهي)\n`; }
                }
                report += `━━━━━━━━━━━━━━\n🟢 مفعل: ${active} | 🔴 منتهي: ${expired}`;
                await chat.sendMessage(report); return;
            }

            if (!chat.isGroup && (text.startsWith('!تفعيل') || text.startsWith('!ايقاف') || text === '!فحص')) {
                await chat.sendMessage(`${botPrefix}⚠️ عذراً، يجب كتابة هذا الأمر داخل الجروب.`); return;
            }
        }

        if (!chat.isGroup) return;

        const chatId = chat.id._serialized;
        let botIsAdmin = false;
        try { const botId = client.info.wid._serialized.replace(/:\d+/, ""); botIsAdmin = chat.participants.some(p => p.id._serialized === botId && (p.isAdmin || p.isSuperAdmin)); } catch(e) {}
        const isSenderAdmin = chat.participants.some(p => p.id._serialized === senderId && (p.isAdmin || p.isSuperAdmin));

        if (!groupSettings[chatId]) {
            groupSettings[chatId] = { links: 'members', swear: 'members', merchant: false, stickers: false, antiMention: 'members', linkAction: 'kick', botProtect: false, expireAt: null, expiredNotified: false };
        }
        const settings = groupSettings[chatId];

        if (isBotOwner || isSenderAdmin) {
            if (text === '!طرد') {
                if (!botIsAdmin) { await chat.sendMessage(`${botPrefix}❌ البوت ليس مشرفاً!`); return; }
                if (msg.hasQuotedMsg) {
                    const quotedMsg = await msg.getQuotedMessage(); const targetId = quotedMsg.author || quotedMsg.from;
                    if (targetId) { try { await chat.removeParticipants([targetId]); await chat.sendMessage(`${botPrefix}👋 تم طرد العضو.`, { mentions:[targetId] }); } catch(e) {} }
                }
                return;
            }
            if (text === '!قائمة الشتائم') {
                if (!swearCounts[chatId] || Object.keys(swearCounts[chatId]).length === 0) { await chat.sendMessage(`${botPrefix}✨ الجروب نظيف.`); return; }
                const sorted = Object.entries(swearCounts[chatId]).sort((a, b) => b[1] - a[1]).slice(0, 10);
                let report = `${botPrefix}📜 *قائمة أكثر الأعضاء مخالفة (شتائم):*\n\n`; let mentions = [];
                sorted.forEach(([uid, count], index) => { const num = uid.split('@')[0]; report += `${index + 1}. (@${num}) ➔ ${count} مرة\n`; mentions.push(uid); });
                await chat.sendMessage(report, { mentions: mentions }); return;
            }
        }

        if (isBotOwner) {
            if (text === '!تفعيل الروابط للاعضاء') { settings.links = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!تفعيل الروابط للكل') { settings.links = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!ايقاف الروابط') { settings.links = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم الإيقاف.`); return; }
            if (text === '!نظام الروابط طرد') { settings.linkAction = 'kick'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ طرد بعد 3 إنذارات.`); return; }
            if (text === '!نظام الروابط حذف') { settings.linkAction = 'deleteOnly'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ حذف فقط.`); return; }

            if (text === '!تفعيل الشتائم للاعضاء') { settings.swear = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!تفعيل الشتائم للكل') { settings.swear = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!ايقاف الشتائم') { settings.swear = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم الإيقاف.`); return; }

            if (text === '!تفعيل حماية البوت') { settings.botProtect = true; saveSettings(); await chat.sendMessage(`${botPrefix}🛡️ تم التفعيل.`); return; }
            if (text === '!ايقاف حماية البوت') { settings.botProtect = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم الإيقاف.`); return; }

            if (text === '!تفعيل المنشن للاعضاء') { settings.antiMention = 'members'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!تفعيل المنشن للكل') { settings.antiMention = 'all'; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!ايقاف المنشن') { settings.antiMention = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم الإيقاف.`); return; }
            
            if (text === '!تفعيل التجار') { settings.merchant = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم التفعيل.`); return; }
            if (text === '!ايقاف التجار') { settings.merchant = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم الإيقاف.`); return; }

            if (text === '!تفعيل الكل') {
                settings.expireAt = Date.now() + (3650 * 24 * 60 * 60 * 1000);
                settings.links = 'members'; settings.swear = 'members'; settings.merchant = true; settings.stickers = true; settings.antiMention = 'members'; settings.botProtect = true; settings.expiredNotified = false; saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع الميزات** كباقة مدى الحياة!`); return;
            }

            if (text === '!ايقاف الكل') {
                settings.expireAt = Date.now() - 1000; settings.expiredNotified = true; settings.links = false; settings.swear = false; settings.merchant = false; settings.stickers = false; settings.antiMention = false; settings.botProtect = false; saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات.`); return;
            }

            if (text === '!فحص') {
                let subStatus = "منتهي ❌";
                if (settings.expireAt && settings.expireAt > Date.now()) { const daysLeft = Math.ceil((settings.expireAt - Date.now()) / (1000 * 60 * 60 * 24)); subStatus = `مفعل (${daysLeft} يوم متبقي)`; }
                const formatStatus = (val) => val === 'all' ? '✅ للكل' : (val === 'members' || val === true ? '✅ للأعضاء' : '❌ معطل');
                await chat.sendMessage(`${botPrefix}📊 تقرير شامل للجروب:\n\n*الاشتراك:* ${subStatus}\n\n*الأنظمة:*\n🔗 الروابط: ${formatStatus(settings.links)}\n🤬 الشتائم: ${formatStatus(settings.swear)}\n📢 منشن الكل: ${formatStatus(settings.antiMention)}\n🛡️ حماية البوت: ${settings.botProtect ? '✅' : '❌'}\n🤝 التجار: ${settings.merchant ? '✅' : '❌'}`); return;
            }
        }

        if (!settings.expireAt || Date.now() > settings.expireAt) return;

        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        const isolatedUserKey = `${chatId}_${senderId}`; 
        if (text === '!انذاراتي') { const count = userWarnings[isolatedUserKey] || 0; await chat.sendMessage(`${botPrefix}⚠️ إنذاراتك (روابط): ${count}`, { mentions:[senderId] }); return; }

        if (settings.merchant && pendingMerchants[`${chatId}_SPLIT_${senderId}`]) {
            const mentions = await msg.getMentions();
            if (mentions && mentions.length > 0 && [...new Set(mentions.map(m => m.id._serialized))].length >= 5) {
                clearTimeout(pendingMerchants[`${chatId}_SPLIT_${senderId}`].kickTimer);
                delete pendingMerchants[`${chatId}_SPLIT_${senderId}`]; delete pendingMerchantsData[`${chatId}_SPLIT_${senderId}`]; saveMerchants();
                await chat.sendMessage(`${botPrefix}✅ تم توثيقك كتاجر معتمد.`);
            }
        }

        if (isSpamming(senderId)) { if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} } return; }

        if (settings.antiMention && (text.includes('@الكل') || text.includes('@all') || text.includes('@everyone'))) {
            let shouldStrike = (settings.antiMention === 'all') || ((settings.antiMention === 'members' || settings.antiMention === true) && !isSenderAdmin);
            if (shouldStrike) { if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} } await chat.sendMessage(`${botPrefix}⚠️ يُمنع استخدام منشن (الكل)!`, { mentions:[senderId] }); return; }
        }

        if (settings.botProtect && msg.hasQuotedMsg && containsBadWordSmart(msg.body)) {
            const quotedMsg = await msg.getQuotedMessage(); let botIdRaw = ""; try { botIdRaw = client.info.wid._serialized; } catch(e) {}
            if (quotedMsg.fromMe || quotedMsg.author === botIdRaw || quotedMsg.from === botIdRaw) {
                if (!isSenderAdmin && botIsAdmin) { try { await chat.removeParticipants([senderId]); await chat.sendMessage(`${botPrefix}🚫 تم الطرد لتعديه على البوت.`, { mentions:[senderId] }); } catch(e) {} }
                return; 
            }
        }

        if (settings.swear) {
            let strikeSwear = (settings.swear === 'all') || ((settings.swear === 'members' || settings.swear === true) && !isSenderAdmin);
            if (strikeSwear && containsBadWordSmart(msg.body)) {
                if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} }
                if (!swearCounts[chatId]) swearCounts[chatId] = {}; swearCounts[chatId][senderId] = (swearCounts[chatId][senderId] || 0) + 1; saveSwearCounts();
                await chat.sendMessage(`${botPrefix}⚠️ ممنوع الشتم!`, { mentions:[senderId] }); return;
            }
        }

        if (settings.links && /(https?:\/\/[^\s]+)/i.test(msg.body)) {
            let strikeLink = (settings.links === 'all') || ((settings.links === 'members' || settings.links === true) && !isSenderAdmin);
            if (strikeLink) {
                if (botIsAdmin) { try { await msg.delete(true); } catch (e) {} }
                if (settings.linkAction === 'deleteOnly') { await chat.sendMessage(`${botPrefix}⚠️ يُمنع الروابط! تم الحذف.`, { mentions:[senderId] }); } 
                else {
                    userWarnings[isolatedUserKey] = (userWarnings[isolatedUserKey] || 0) + 1; saveWarnings();
                    if (userWarnings[isolatedUserKey] < 3) { await chat.sendMessage(`${botPrefix}⚠️ تحذير روابط. إنذار ${userWarnings[isolatedUserKey]} من 3.`, { mentions:[senderId] }); } 
                    else { if (botIsAdmin) { try { await chat.removeParticipants([senderId]); userWarnings[isolatedUserKey] = 0; saveWarnings(); await chat.sendMessage(`${botPrefix}🚫 تم طرد المخالف للروابط.`, { mentions: [senderId] }); } catch (e) {} } }
                }
            }
        }
    } catch (err) { console.error('❌ خطأ في معالجة الرسالة:', err.message); }
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
