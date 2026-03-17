const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =========================================
// 🗄️ 1. نظام الذاكرة الدائمة
// =========================================
const dataPath = fs.existsSync('/data') ? '/data' : __dirname;
const dbFile = path.join(dataPath, 'warnings.json');
const settingsFile = path.join(dataPath, 'settings.json');
const merchantsFile = path.join(dataPath, 'merchants.json');

function safeReadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            if (!raw) return defaultValue;
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`⚠️ ملف ${path.basename(filePath)} سيتم إعادة إنشائه.`);
    }
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
    for (const key in pendingMerchants) {
        toSave[key] = pendingMerchants[key].expireTime;
    }
    fs.writeFileSync(merchantsFile, JSON.stringify(toSave, null, 2));
}

// 🧹 نظام التنظيف الذاتي
setInterval(() => {
    let changed = false;
    for (const key in userWarnings) {
        if (userWarnings[key] === 0) {
            delete userWarnings[key];
            changed = true;
        }
    }
    if (changed) saveWarnings();
    if (global.gc) { global.gc(); }
}, 24 * 60 * 60 * 1000);

// =========================================
// 👑 2. أرقام المالكين
// =========================================
const MY_ADMIN_NUMBERS =[
    "201092996413",
    "201091885491",
    "27041768431630"
];

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// =========================================
// 🚫 3. نظام Anti-Spam
// =========================================
const spamTracker = {};
const SPAM_LIMIT = 6;
const SPAM_WINDOW = 8000;

function isSpamming(senderId) {
    const now = Date.now();
    if (!spamTracker[senderId] || (now - spamTracker[senderId].lastReset > SPAM_WINDOW)) {
        spamTracker[senderId] = { count: 1, lastReset: now };
        return false;
    }
    spamTracker[senderId].count++;
    return spamTracker[senderId].count > SPAM_LIMIT;
}

// =========================================
// 🚀 4. إعدادات البوت 
// =========================================
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
            '--single-process', 
            '--disable-gpu',
            '--js-flags="--max-old-space-size=400"'
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
// ⚙️ 5. إعدادات القوانين والكلمات المسيئة + الذكاء الاصطناعي للكلمات
// =========================================
const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = كيك (طرد) 🟥\n3. ممنوع المنشن الجماعي المزعج 🟥\n4. صلِّ على النبي في قلبك كده، واذكر الله.`;

// القائمة المحدثة بالشتائم الجديدة
const badWords =['شرموط', 'متناك', 'غبي', 'حمار', 'كلب', 'عرص', 'خول', 'علق', 'زاني', 'زانية', 'سكس', 'كسمك'];

function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652]/g, "");
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
    return t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, "").replace(/(.)\1+/gu, "$1");
}
const cleanedBadWords = badWords.map(word => cleanText(word));

// خوارزمية Levenshtein Distance (لاكتشاف التغيير في حرف واحد للتحايل)
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var matrix =[];
    for (var i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (var j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

// دالة فحص الكلمات المطورة (تكتشف التطابق + التحايل بحرف واحد)
function containsBadWordFuzzy(messageText) {
    const cleanedMessage = cleanText(messageText);
    const messageWords = cleanedMessage.split(/\s+/);
    
    return messageWords.some(userWord => {
        return cleanedBadWords.some(badWord => {
            // 1. تطابق تام
            if (userWord === badWord) return true;
            // 2. تطابق متقارب (التحايل بحرف واحد) للكلمات التي طولها 4 حروف أو أكثر
            if (badWord.length >= 4 && Math.abs(userWord.length - badWord.length) <= 1) {
                const distance = getLevenshteinDistance(userWord, badWord);
                if (distance <= 1) return true; // مسموح بخطأ/تحايل في حرف واحد فقط
            }
            return false;
        });
    });
}

// =========================================
// 🛡️ 6. نظام توثيق التجار (30 دقيقة)
// =========================================
async function restoreMerchantTimers() {
    const now = Date.now();
    for (const userKey in pendingMerchantsData) {
        const expireTime = pendingMerchantsData[userKey];
        const remaining = expireTime - now;
        const parts = userKey.split('_SPLIT_');
        const chatId = parts[0];
        const userId = parts[1];

        if (remaining <= 0) {
            try {
                const chat = await client.getChatById(chatId);
                await chat.removeParticipants([userId]);
            } catch (err) {}
            delete pendingMerchantsData[userKey];
        } else {
            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const chat = await client.getChatById(chatId);
                        const userNumber = userId.split('@')[0];
                        await chat.removeParticipants([userId]);
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة (30 دقيقة) بدون توثيق.`, { mentions: [userId] });
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
                            const userNumber = userId.split('@')[0];
                            await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي 3 دقائق فقط لعمل منشن لـ 5 تجار أو سيتم طردك!`, { mentions: [userId] });
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
            const welcomeMsg =
                `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\n` +
                `أمامك (30 دقيقة) لإثبات أنك تاجر ولست زبوناً.\n` +
                `قم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار كضمان لك.\n` +
                `⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
            await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

            const userKey = `${chatId}_SPLIT_${joinedUserId}`;
            const expireTime = Date.now() + (30 * 60 * 1000); 

            const warningTimer = setTimeout(async () => {
                if (pendingMerchants[userKey])
                    await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي 3 دقائق لعمل منشن لـ 5 تجار أو سيتم طردك!`, { mentions: [joinedUserId] });
            }, 27 * 60 * 1000); 

            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        await chat.removeParticipants([joinedUserId]);
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لتجاوزه المهلة (30 دقيقة) بدون توثيق.`, { mentions:[joinedUserId] });
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, 30 * 60 * 1000); 

            pendingMerchants[userKey] = { warningTimer, kickTimer, expireTime };
            pendingMerchantsData[userKey] = expireTime; saveMerchants();
        }
    } catch (error) {}
});

// =========================================
// 📩 7. نظام استقبال الرسائل والأوامر
// =========================================
client.on('message_create', async msg => {
    try {
        const chat = await msg.getChat();
        if (!chat.isGroup) return;

        let rawSenderId = msg.fromMe ? (msg.from || msg.to) : (msg.author || msg.from);
        if (msg.fromMe && client.info && client.info.wid) { rawSenderId = client.info.wid._serialized; }
        const senderId = rawSenderId.replace(/:\d+/, "");
        const senderNumber = senderId.split('@')[0];
        const chatId = chat.id._serialized;
        const text = msg.body.trim();

        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber);

        if (!groupSettings[chatId]) {
            groupSettings[chatId] = {
                links: false, swear: false, merchant: false, stickers: false, 
                linkAction: 'kick', expireAt: null, expiredNotified: false
            };
        }

        // =========================================
        // 🌟 أوامر المالك (إدارة مرنة للميزات) 🌟
        // =========================================
        if (isBotOwner) {
            
            // --- أوامر التشغيل والايقاف الفردية للخصائص ---
            if (text === '!تفعيل الروابط') { groupSettings[chatId].links = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل نظام مكافحة الروابط.`); return; }
            if (text === '!ايقاف الروابط') { groupSettings[chatId].links = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام مكافحة الروابط.`); return; }
            
            if (text === '!تفعيل الشتائم') { groupSettings[chatId].swear = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل الفلتر الذكي للشتائم.`); return; }
            if (text === '!ايقاف الشتائم') { groupSettings[chatId].swear = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف فلتر الشتائم.`); return; }
            
            if (text === '!تفعيل التجار') { groupSettings[chatId].merchant = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل نظام توثيق التجار.`); return; }
            if (text === '!ايقاف التجار') { groupSettings[chatId].merchant = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف نظام توثيق التجار.`); return; }
            
            if (text === '!تفعيل الملصقات') { groupSettings[chatId].stickers = true; saveSettings(); await chat.sendMessage(`${botPrefix}✅ تم تشغيل صانع الملصقات.`); return; }
            if (text === '!ايقاف الملصقات') { groupSettings[chatId].stickers = false; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف صانع الملصقات.`); return; }

            // --- التحكم في نظام الروابط (طرد / حذف) ---
            if (text === '!نظام الروابط طرد') { groupSettings[chatId].linkAction = 'kick'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ تم ضبط نظام الروابط: (طرد بعد 3 إنذارات).`); return; }
            if (text === '!نظام الروابط حذف') { groupSettings[chatId].linkAction = 'deleteOnly'; saveSettings(); await chat.sendMessage(`${botPrefix}⚙️ تم ضبط نظام الروابط: (حذف فقط بدون طرد).`); return; }

            // --- أوامر الاشتراكات والباقات ---
            if (text === '!تفعيل الكل') {
                const newExpireAt = Date.now() + (3650 * 24 * 60 * 60 * 1000);
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].links = true; groupSettings[chatId].swear = true;
                groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                groupSettings[chatId].expiredNotified = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع الميزات** كباقة مدى الحياة!`);
                return;
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
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].links = true; groupSettings[chatId].swear = true;
                groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                saveSettings();
                await chat.sendMessage(`✅ *تم تفعيل البوت!*\n📦 *الباقة:* ${packageName}\n🛑 *ينتهي:* ${formatDate(newExpireAt)}`);
                return;
            }

            if (text === '!ايقاف الكل' || text === '!الغاء الاشتراك') {
                groupSettings[chatId].expireAt = Date.now() - 1000;
                groupSettings[chatId].expiredNotified = true; 
                groupSettings[chatId].links = false; groupSettings[chatId].swear = false;
                groupSettings[chatId].merchant = false; groupSettings[chatId].stickers = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات بنجاح.`);
                return;
            }

            if (text === '!فحص') {
                let subStatus = "منتهي ❌";
                if (groupSettings[chatId].expireAt && groupSettings[chatId].expireAt > Date.now()) {
                    const daysLeft = Math.ceil((groupSettings[chatId].expireAt - Date.now()) / (1000 * 60 * 60 * 24));
                    subStatus = `مفعل (${daysLeft} يوم متبقي)\nينتهي: ${formatDate(groupSettings[chatId].expireAt)}`;
                }
                const linkSys = groupSettings[chatId].linkAction === 'deleteOnly' ? 'حذف فقط' : 'طرد';
                const f_links = groupSettings[chatId].links ? '✅' : '❌';
                const f_swear = groupSettings[chatId].swear ? '✅' : '❌';
                const f_merch = groupSettings[chatId].merchant ? '✅' : '❌';
                const f_stick = groupSettings[chatId].stickers ? '✅' : '❌';
                
                await chat.sendMessage(`${botPrefix}📊 تقرير شامل للجروب:\n\n*الاشتراك:* ${subStatus}\n*نظام الروابط:* ${linkSys}\n\n*الميزات النشطة:*\nالروابط: ${f_links} | الشتائم: ${f_swear}\nالتجار: ${f_merch} | الملصقات: ${f_stick}`);
                return;
            }

            if (text === '!كل الجروبات') {
                const now = Date.now();
                let report = `${botPrefix}📋 *تقرير الجروبات المسجلة:*\n\n`;
                let active = 0, expired = 0;

                for (const gId in groupSettings) {
                    const gs = groupSettings[gId];
                    if (!gs.expireAt) continue;
                    
                    let groupName = "غير معروف";
                    try {
                        const targetChat = await client.getChatById(gId);
                        if (targetChat && targetChat.name) { groupName = targetChat.name; }
                    } catch (e) {}
                    
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

                try {
                    const dmChat = await client.getChatById(senderId);
                    await dmChat.sendMessage(report);
                    await chat.sendMessage(`${botPrefix}✅ تم إرسال التقرير الشامل (الأسماء والأرقام) إلى الخاص.`);
                } catch (err) {
                    await chat.sendMessage(`${botPrefix}⚠️ أرسل لي أي رسالة في الخاص أولاً لكي أستطيع إرسال التقرير لك.`);
                }
                return;
            }
        }

        // =========================================
        // 🛑 البوابة الحديدية (التحقق من مدة الاشتراك)
        // =========================================
        const settings = groupSettings[chatId];
        if (!settings.expireAt) return; 

        if (Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                groupSettings[chatId].expiredNotified = true; 
                saveSettings(); 
                try { await chat.sendMessage(`⚠️ انتهى اشتراك البوت في الجروب. يرجى التجديد.`); } catch (e) {}
            }
            return; 
        }

        // =========================================
        // 🌟 أوامر الأعضاء والأنظمة المسموحة للجميع
        // =========================================
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        
        const isolatedUserKey = `${chatId}_${senderId}`; 
        
        if (text === '!انذاراتي') {
            const count = userWarnings[isolatedUserKey] || 0;
            const max = settings.linkAction === 'deleteOnly' ? 'غير محدود (حذف فقط)' : '3';
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ إنذاراتك في هذا الجروب: ${count} / ${max}`, { mentions:[senderId] }); return;
        }

        if (text === '!ملصق' && settings.stickers) {
            try {
                let targetMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage() : msg;
                if (targetMsg.hasMedia) {
                    const media = await targetMsg.downloadMedia();
                    if (media && (media.mimetype === 'image/jpeg' || media.mimetype === 'image/png')) {
                        await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير' });
                    }
                }
            } catch (error) {}
            return;
        }

        // توثيق التجار (من خلال المنشن)
        if (settings.merchant) {
            const userKey = `${chatId}_SPLIT_${senderId}`;
            if (pendingMerchants[userKey]) {
                const mentions = await msg.getMentions();
                if (mentions && mentions.length >= 5) {
                    clearTimeout(pendingMerchants[userKey].warningTimer);
                    clearTimeout(pendingMerchants[userKey].kickTimer);
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                    await chat.sendMessage(`${botPrefix}✅ تم توثيقك كتاجر معتمد.`);
                }
            }
        }

        // =========================================
        // ⚖️ الحصانة القوية للمشرفين والمالك
        // =========================================
        const isSenderAdmin = chat.participants.find(p => p.id._serialized === senderId)?.isAdmin ||
                              chat.participants.find(p => p.id._serialized === senderId)?.isSuperAdmin;
        const isImmune = isSenderAdmin || isBotOwner;
        
        if (isImmune) return; // 🛑 البوت يتوقف هنا تماماً إذا كان المرسل مشرفاً

        // =========================================
        // ⚔️ العقوبات للأعضاء العاديين فقط
        // =========================================
        
        // 1. نظام Anti-Spam (منع الإزعاج)
        if (isSpamming(senderId)) { try { await msg.delete(true); } catch (e) {} return; }

        // 2. نظام منع المنشن الجماعي (Anti-Mass Mention)
        if (msg.mentionedIds && msg.mentionedIds.length > 10) {
            try { await msg.delete(true); } catch (error) {}
            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع استخدام المنشن الجماعي المزعج في هذا الجروب.`, { mentions: [senderId] });
            return;
        }

        // 3. نظام مكافحة الشتائم المتطور (الذكاء الاصطناعي)
        if (settings.swear && containsBadWordFuzzy(msg.body)) {
            try { await msg.delete(true); } catch (error) {}
            await chat.sendMessage(`${botPrefix}⚠️ الشتائم والتحايل بالألفاظ ممنوع يا (@${senderNumber})!`, { mentions:[senderId] });
            return;
        }

        // 4. نظام منع الروابط
        if (settings.links && /(https?:\/\/[^\s]+)/g.test(msg.body)) {
            try { await msg.delete(true); } catch (error) {}
            
            if (settings.linkAction === 'deleteOnly') {
                await chat.sendMessage(`${botPrefix}⚠️ يُمنع إرسال الروابط يا (@${senderNumber})! تم حذف رسالتك.`, { mentions: [senderId] });
            } else {
                userWarnings[isolatedUserKey] = (userWarnings[isolatedUserKey] || 0) + 1; saveWarnings();
                const warningsCount = userWarnings[isolatedUserKey];

                if (warningsCount < 3) {
                    await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع الروابط.\nإنذار ${warningsCount} من 3 في هذا الجروب.`, { mentions:[senderId] });
                } else {
                    let isKicked = false;
                    try { await chat.removeParticipants([senderId]); isKicked = true; userWarnings[isolatedUserKey] = 0; saveWarnings(); } catch (error) {}
                    await chat.sendMessage(isKicked ? `${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه 3 إنذارات.` : `${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 إنذارات!\n(يرجى من المشرفين طرده).`, { mentions: [senderId] });
                }
            }
        }

    } catch (err) {}
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
