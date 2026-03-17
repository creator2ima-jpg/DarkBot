const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =========================================
// 🗄️ 1. نظام الذاكرة الدائمة (Volume)
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

// =========================================
// 👑 2. أرقام المالك
// =========================================
const MY_ADMIN_NUMBERS =[
    "201092996413",
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
// 🚀 4. إعدادات البوت (تم إصلاح العطل التقني هنا)
// =========================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataPath }),
    // تم إزالة webVersionCache لأنه يسبب عمى للبوت مع التحديثات الجديدة
    puppeteer: {
        headless: true,
        args:[
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--single-process', '--disable-gpu'
        ]
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('=========================================');
    console.log('🔗 امسك الهاتف وامسح الـ QR من الشاشة المربعة بالأعلى');
    console.log('=========================================');
});

client.on('ready', () => {
    console.log('✅ البوت جاهز ويعمل الآن بكفاءة ويقرأ الرسائل.');
    restoreMerchantTimers();
});

let isReconnecting = false;
client.on('disconnected', async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 انقطع الاتصال، إعادة التشغيل بعد 5 ثوانٍ...');
    try { await client.destroy(); } catch (err) {}
    setTimeout(async () => {
        try { await client.initialize(); } catch (err) {}
        isReconnecting = false;
    }, 5000);
});

// =========================================
// ⚙️ 5. إعدادات القوانين والكلمات المسيئة
// =========================================
const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = كيك (طرد) 🟥\n3. صلِّ على النبي في قلبك كده، واذكر الله.`;

const badWords =['شرموط', 'متناك', 'غبي', 'حمار', 'كلب'];
function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652]/g, "");
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
    return t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, "").replace(/(.)\1+/gu, "$1");
}
const cleanedBadWords = badWords.map(word => cleanText(word));

// =========================================
// 🛡️ 6. نظام توثيق التجار (الترحيب)
// =========================================
async function restoreMerchantTimers() {
    // ... (تم الحفاظ على الكود الخاص بك هنا كما هو)
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
                `أمامك (10 دقائق) لإثبات أنك تاجر.\n` +
                `قم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار كضمان لك.\n` +
                `⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
            await chat.sendMessage(welcomeMsg, { mentions:[joinedUserId] });

            const userKey = `${chatId}_SPLIT_${joinedUserId}`;
            const expireTime = Date.now() + (10 * 60 * 1000);

            const warningTimer = setTimeout(async () => {
                if (pendingMerchants[userKey])
                    await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})! متبقي دقيقة للطرد.`, { mentions: [joinedUserId] });
            }, 9 * 60 * 1000);

            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        await chat.removeParticipants([joinedUserId]);
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه.`, { mentions:[joinedUserId] });
                    } catch (err) {}
                    delete pendingMerchants[userKey]; delete pendingMerchantsData[userKey]; saveMerchants();
                }
            }, 10 * 60 * 1000);

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
        if (!chat.isGroup) return; // البوت يتجاهل الخاص ويعمل في الجروبات فقط

        // الاستخراج الدقيق للرقم
        let rawSenderId = msg.fromMe ? (msg.from || msg.to) : (msg.author || msg.from);
        if (msg.fromMe && client.info && client.info.wid) {
            rawSenderId = client.info.wid._serialized;
        }
        const senderId = rawSenderId.replace(/:\d+/, "");
        const senderNumber = senderId.split('@')[0];
        const chatId = chat.id._serialized;
        const text = msg.body.trim();

        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber);

        // ✅ السطر الكشاف لمعرفة هل قرأ البوت رسالتك أم لا (سيظهر في Railway)
        console.log(`📱 رسالة من: ${senderNumber} | المالك؟ ${isBotOwner} | النص: ${text.substring(0,15)}`);

        if (!groupSettings[chatId]) {
            groupSettings[chatId] = {
                links: false, swear: false, merchant: false,
                stickers: false, expireAt: null, expiredNotified: false
            };
        }

        // =========================================
        // 🌟 أوامر المالك فقط 🌟
        // =========================================
        if (isBotOwner) {
            
            // الزر السحري الجديد الشامل
            if (text === '!تفعيل الكل') {
                const newExpireAt = Date.now() + (3650 * 24 * 60 * 60 * 1000); // تفعيل لمدة 10 سنوات
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].links = true;
                groupSettings[chatId].swear = true;
                groupSettings[chatId].merchant = true;
                groupSettings[chatId].stickers = true;
                groupSettings[chatId].expiredNotified = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع ميزات البوت** بنجاح للجروب كباقة مدى الحياة!`);
                return;
            }

            // نظام الباقات الجديد
            if (text.startsWith('!تفعيل ')) {
                const parts = text.split(' ');
                const packageType = parts[1];
                let daysToAdd = 0; let packageName = "";

                if (packageType === '1') { daysToAdd = 5; packageName = "الفترة التجريبية (5 أيام)"; }
                else if (packageType === '2') { daysToAdd = 7; packageName = "باقة الأسبوع (7 أيام)"; }
                else if (packageType === '3') { daysToAdd = 30; packageName = "باقة الشهر (30 يوم)"; }
                else { return; } // يتجاهل الأوامر الخاطئة

                const newExpireAt = Date.now() + (daysToAdd * 24 * 60 * 60 * 1000);
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].links = true; groupSettings[chatId].swear = true;
                groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                saveSettings();

                await chat.sendMessage(`✅ *تم تفعيل البوت بنجاح!*\n📦 *الباقة:* ${packageName}\n🛑 *ينتهي في:* ${formatDate(newExpireAt)}`);
                return;
            }

            if (text === '!ايقاف الكل' || text === '!الغاء الاشتراك') {
                groupSettings[chatId].expireAt = Date.now() - 1000;
                groupSettings[chatId].links = false; groupSettings[chatId].swear = false;
                groupSettings[chatId].merchant = false; groupSettings[chatId].stickers = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات. البوت الآن في وضع السكون.`);
                return;
            }

            if (text === '!فحص') {
                let subStatus = "الاشتراك منتهي ❌";
                if (groupSettings[chatId].expireAt && groupSettings[chatId].expireAt > Date.now()) {
                    const daysLeft = Math.ceil((groupSettings[chatId].expireAt - Date.now()) / (1000 * 60 * 60 * 24));
                    subStatus = `مفعل (${daysLeft} يوم متبقي) ⏳\nينتهي في: ${formatDate(groupSettings[chatId].expireAt)}`;
                }
                await chat.sendMessage(`${botPrefix}📊 تقرير الجروب:\nحالة الاشتراك: ${subStatus}`);
                return;
            }
        }

        // =========================================
        // 🛑 البوابة الحديدية (التحقق من الاشتراك)
        // =========================================
        const settings = groupSettings[chatId];
        if (!settings.expireAt) return; // الجروب غير مسجل أبداً

        if (Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                await chat.sendMessage(`⚠️ *تنبيه!*\nانتهت فترة اشتراك البوت في الجروب. يرجى التجديد للاستمرار.`);
                groupSettings[chatId].expiredNotified = true;
                saveSettings();
            }
            return; // إيقاف كل شيء لأن الاشتراك منتهي
        }

        // =========================================
        // 🌟 أوامر الأعضاء العاديين
        // =========================================
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        if (text === '!انذاراتي') {
            const count = userWarnings[senderId] || 0;
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ عدد إنذاراتك: ${count}/3.`, { mentions:[senderId] }); return;
        }

        if (text === '!ملصق' && settings.stickers) {
            try {
                let targetMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage() : msg;
                if (targetMsg.hasMedia) {
                    const media = await targetMsg.downloadMedia();
                    if (media && media.mimetype.includes('image')) {
                        await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير', stickerAuthor: 'Dark Fire Bot' });
                    }
                }
            } catch (error) {}
            return;
        }

        // =========================================
        // 🛡️ توثيق التجار من خلال الرسالة
        // =========================================
        if (settings.merchant) {
            const userKey = `${chatId}_SPLIT_${senderId}`;
            if (pendingMerchants[userKey]) {
                const mentions = await msg.getMentions();
                if (mentions.length >= 5) {
                    clearTimeout(pendingMerchants[userKey].warningTimer);
                    clearTimeout(pendingMerchants[userKey].kickTimer);
                    delete pendingMerchants[userKey];
                    delete pendingMerchantsData[userKey];
                    saveMerchants();
                    await chat.sendMessage(`${botPrefix}✅ مبروك! تم توثيقك كتاجر معتمد.`);
                }
            }
        }

        // =========================================
        // ⚖️ الحصانة والعقوبات
        // =========================================
        const isSenderAdmin = chat.participants.find(p => p.id._serialized === senderId)?.isAdmin ||
                              chat.participants.find(p => p.id._serialized === senderId)?.isSuperAdmin;
        const isImmune = isSenderAdmin || isBotOwner;
        if (isImmune) return; // تجاهل المشرفين والمالك من العقوبات

        if (isSpamming(senderId)) { try { await msg.delete(true); } catch (e) {} return; }

        if (settings.swear && cleanText(msg.body).split(/\s+/).some(word => cleanedBadWords.includes(word))) {
            try { await msg.delete(true); } catch (error) {}
            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nالشتائم ممنوعة.`, { mentions:[senderId] });
            return;
        }

        if (settings.links && /(https?:\/\/[^\s]+)/g.test(msg.body)) {
            try { await msg.delete(true); } catch (error) {}
            userWarnings[senderId] = (userWarnings[senderId] || 0) + 1; saveWarnings();
            const warningsCount = userWarnings[senderId];

            if (warningsCount < 3) {
                await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع الروابط.\nتحذير ${warningsCount} من 3.`, { mentions: [senderId] });
            } else {
                let isKicked = false;
                try { await chat.removeParticipants([senderId]); isKicked = true; userWarnings[senderId] = 0; saveWarnings(); } catch (error) {}
                await chat.sendMessage(isKicked ? `${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه التحذيرات.` : `${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 تحذيرات!\n(يرجى من المشرفين طرده).`, { mentions: [senderId] });
            }
        }

    } catch (err) {}
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
