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
const merchantsFile = path.join(dataPath, 'merchants.json'); // ✅ جديد

// ✅ تحسين: قراءة JSON آمنة تمنع الكراش عند تلف الملف
function safeReadJSON(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`⚠️ تحذير: ملف ${filePath} تالف، سيتم إعادة إنشائه.`);
        // نسخ احتياطي للملف التالف
        fs.copyFileSync(filePath, filePath + '.bak');
    }
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
}

let userWarnings = safeReadJSON(dbFile);
function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }

let groupSettings = safeReadJSON(settingsFile);
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }

// ✅ جديد: تحميل pendingMerchants من الـ Volume عند إعادة التشغيل
let pendingMerchantsData = safeReadJSON(merchantsFile); // {userKey: {expireTime: timestamp}}
const pendingMerchants = {}; // المؤقتات الحية في الذاكرة
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
const MY_ADMIN_NUMBERS = [
    "201092996413",
    "27041768431630"
];

// =========================================
// 📅 3. دالة تنسيق التاريخ للفواتير
// =========================================
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// =========================================
// 🚀 4. إعدادات البوت والاتصال
// =========================================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataPath }),
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
               '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
               '--single-process', '--disable-gpu', '--memory-pressure-off',
               '--js-flags="--max-old-space-size=250"', '--disk-cache-size=0',
               '--disable-application-cache', '--disable-offline-load-stale-cache']
    }
});

client.on('qr', qr => { qrcode.generate(qr, { small: true }); console.log('امسح كود الـ QR'); });
client.on('ready', () => {
    console.log('✅ البوت جاهز ويعمل بنظام الباقات التجارية.');
    // ✅ جديد: استئناف مؤقتات التوثيق بعد إعادة التشغيل
    restoreMerchantTimers();
    // ✅ جديد: تشغيل نظام تنبيهات التجديد
    startRenewalChecker();
});

// ✅ تحسين: منع تشغيل مزدوج للـ reconnect + delay آمن
let isReconnecting = false;
client.on('disconnected', async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 انقطع الاتصال، جاري إعادة التشغيل بعد 5 ثوانٍ...');
    try { await client.destroy(); } catch (err) {}
    setTimeout(async () => {
        try {
            await client.initialize();
        } catch (err) {
            console.error('فشل إعادة التشغيل:', err.message);
        }
        isReconnecting = false;
    }, 5000); // ✅ delay 5 ثوانٍ يمنع حلقة الكراش السريعة
});

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

// =========================================
// ⚙️ 5. إعدادات القوانين والكلمات المسيئة
// =========================================
const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = كيك (طرد) 🟥\n3. صلِّ على النبي في قلبك كده، واذكر الله.`;

const badWords = ['شرموط', 'متناك', 'غبي', 'حمار', 'كلب'];
function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652]/g, "");
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
    return t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, "").replace(/(.)\1+/gu, "$1");
}
const cleanedBadWords = badWords.map(word => cleanText(word));

// =========================================
// 🔔 6. نظام تنبيهات التجديد التلقائي (جديد)
// =========================================
function startRenewalChecker() {
    // يعمل مرة كل ساعة
    setInterval(async () => {
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

        for (const chatId in groupSettings) {
            const settings = groupSettings[chatId];
            if (!settings.expireAt) continue;

            const timeLeft = settings.expireAt - now;

            // ✅ تنبيه قبل الانتهاء بـ 3 أيام (مرة واحدة فقط)
            if (timeLeft > 0 && timeLeft <= threeDaysMs && !settings.renewalNotified) {
                try {
                    const chat = await client.getChatById(chatId);
                    const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                    await chat.sendMessage(
                        `⚠️ *تنبيه تجديد الاشتراك!*\n\n` +
                        `متبقي فقط *${daysLeft} يوم/أيام* على انتهاء اشتراك البوت في هذا الجروب.\n` +
                        `ينتهي في: ${formatDate(settings.expireAt)}\n\n` +
                        `لتجنب انقطاع الخدمة، يرجى التواصل مع الإدارة لتجديد الاشتراك مسبقاً. 📞`
                    );
                    groupSettings[chatId].renewalNotified = true;
                    saveSettings();
                } catch (err) {}
            }

            // ✅ إعادة تفعيل التنبيه بعد التجديد (تلقائياً عند تفعيل !تفعيل)
        }
    }, 60 * 60 * 1000); // كل ساعة
}

// =========================================
// 🛡️ 7. نظام توثيق التجار (مع الاستئناف)
// =========================================

// ✅ جديد: استئناف مؤقتات التوثيق بعد إعادة تشغيل البوت
async function restoreMerchantTimers() {
    const now = Date.now();
    for (const userKey in pendingMerchantsData) {
        const expireTime = pendingMerchantsData[userKey];
        const remaining = expireTime - now;

        if (remaining <= 0) {
            // المهلة انتهت وهو offline — ننفذ الطرد الآن
            const [chatId, userId] = userKey.split('_SPLIT_');
            try {
                const chat = await client.getChatById(chatId);
                await chat.removeParticipants([userId]);
                const userNumber = userId.split('@')[0];
                await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه.`, { mentions: [userId] });
            } catch (err) {}
            delete pendingMerchantsData[userKey];
        } else {
            // المهلة لم تنته — نعيد ضبط المؤقت بالوقت المتبقي
            const [chatId, userId] = userKey.split('_SPLIT_');
            const kickTimer = setTimeout(async () => {
                if (pendingMerchants[userKey]) {
                    try {
                        const chat = await client.getChatById(chatId);
                        const userNumber = userId.split('@')[0];
                        await chat.removeParticipants([userId]);
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه.`, { mentions: [userId] });
                    } catch (err) {}
                    delete pendingMerchants[userKey];
                    delete pendingMerchantsData[userKey];
                    saveMerchants();
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

        const joinedUserId = notification.recipientIds[0];
        const chat = await client.getChatById(chatId);
        const userNumber = joinedUserId.split('@')[0];

        const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\nأمامك (10 دقائق) لإثبات أنك تاجر ولست زبوناً.\nقم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار كضمان لك.\n⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
        await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

        // ✅ تغيير فاصل المفتاح لتجنب التعارض مع الـ chatId
        const userKey = `${chatId}_SPLIT_${joinedUserId}`;
        const expireTime = Date.now() + (10 * 60 * 1000);

        const warningTimer = setTimeout(async () => {
            if (pendingMerchants[userKey])
                await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي دقيقة لعمل منشن لـ 5 تجار أو سيتم طردك!`, { mentions: [joinedUserId] });
        }, 9 * 60 * 1000);

        const kickTimer = setTimeout(async () => {
            if (pendingMerchants[userKey]) {
                try {
                    await chat.removeParticipants([joinedUserId]);
                    await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه.`, { mentions: [joinedUserId] });
                } catch (err) {}
                delete pendingMerchants[userKey];
                delete pendingMerchantsData[userKey];
                saveMerchants(); // ✅ حفظ عند الحذف
            }
        }, 10 * 60 * 1000);

        pendingMerchants[userKey] = { warningTimer, kickTimer, expireTime };
        pendingMerchantsData[userKey] = expireTime;
        saveMerchants(); // ✅ حفظ فوري عند إضافة تاجر جديد
    } catch (error) {}
});

// =========================================
// 📩 8. نظام استقبال الرسائل والأوامر
// =========================================
client.on('message_create', async msg => {
    try {
        const chat = await msg.getChat();
        if (!chat.isGroup) return;

        let rawSenderId = msg.fromMe ? client.info.wid._serialized : (msg.author || msg.from);
        const senderId = rawSenderId.replace(/:\d+/, "");
        const senderNumber = senderId.split('@')[0];
        const chatId = chat.id._serialized;
        const text = msg.body.trim();

        const isBotOwner = msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber);

        if (!groupSettings[chatId]) {
            groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false, expireAt: null, expiredNotified: false, renewalNotified: false };
        }

        // 🌟 أوامر المالك فقط 🌟
        if (isBotOwner) {

            if (text.startsWith('!تفعيل')) {
                const packageType = text.split(' ')[1];
                let daysToAdd = 0;
                let packageName = "";

                if (packageType === '1') { daysToAdd = 5; packageName = "الفترة التجريبية (5 أيام مجاناً) 🎁"; }
                else if (packageType === '2') { daysToAdd = 7; packageName = "باقة الأسبوع (7 أيام) 🥉"; }
                else if (packageType === '3') { daysToAdd = 30; packageName = "باقة الشهر (30 يوم) 🥇"; }
                // ✅ جديد: باقة مخصصة — !تفعيل 4 [عدد الأيام]
                else if (packageType === '4') {
                    const customDays = parseInt(text.split(' ')[2]);
                    if (!customDays || customDays < 1 || customDays > 365) {
                        await chat.sendMessage(`${botPrefix}⚠️ صيغة غير صحيحة!\nالاستخدام: !تفعيل 4 [عدد الأيام]\nمثال: !تفعيل 4 15`);
                        return;
                    }
                    daysToAdd = customDays;
                    packageName = `باقة مخصصة (${customDays} يوم) ✨`;
                }
                else {
                    await chat.sendMessage(`${botPrefix}⚠️ خطأ! الباقات المتاحة:\n!تفعيل 1 (5 أيام مجاناً)\n!تفعيل 2 (7 أيام)\n!تفعيل 3 (30 يوم)\n!تفعيل 4 [أيام] (مخصص)`);
                    return;
                }

                const now = Date.now();
                const baseTime = (groupSettings[chatId].expireAt && groupSettings[chatId].expireAt > now) ? groupSettings[chatId].expireAt : now;
                const newExpireAt = baseTime + (daysToAdd * 24 * 60 * 60 * 1000);

                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].renewalNotified = false; // ✅ إعادة تفعيل تنبيه التجديد
                groupSettings[chatId].links = true;
                groupSettings[chatId].swear = true;
                groupSettings[chatId].merchant = true;
                groupSettings[chatId].stickers = true;
                saveSettings();

                // ✅ تحسين: الفاتورة تشمل الباقة السابقة إن وجدت
                const wasActive = baseTime > now;
                const renewalNote = wasActive ? `\n♻️ *تم التجديد فوق الاشتراك الحالي*` : '';
                const receiptMsg = `✅ *تم تفعيل البوت وحماية الجروب بنجاح!*\n\n📦 *الباقة:* ${packageName}\n⏳ *المدة:* ${daysToAdd} أيام${renewalNote}\n📅 *يبدأ من:* ${formatDate(now)}\n🛑 *ينتهي في:* ${formatDate(newExpireAt)}\n\nنتمنى لكم تجربة مميزة مع حماية دارك فاير! 🛡️`;
                await chat.sendMessage(receiptMsg);
                return;
            }

            if (text === '!الغاء الاشتراك') {
                groupSettings[chatId].expireAt = Date.now() - 1000;
                groupSettings[chatId].expiredNotified = false;
                saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إنهاء اشتراك الجروب وإيقاف البوت فوراً!`);
                return;
            }

            if (text === '!فحص') {
                const isSaved = groupSettings[chatId] ? "نعم ✅" : "لا ❌";
                let subStatus = "غير مفعل ⚠️";
                if (groupSettings[chatId].expireAt) {
                    const remaining = groupSettings[chatId].expireAt - Date.now();
                    if (remaining > 0) {
                        const daysLeft = Math.ceil(remaining / (1000 * 60 * 60 * 24));
                        subStatus = `مفعل (${daysLeft} يوم متبقي) ⏳\nينتهي في: ${formatDate(groupSettings[chatId].expireAt)}`;
                    } else { subStatus = "الاشتراك منتهي ❌"; }
                }
                await chat.sendMessage(`${botPrefix}📊 تقرير النظام:\nالجروب مسجل: ${isSaved}\nحالة الاشتراك: ${subStatus}`);
                return;
            }

            // ✅ جديد: تقرير كل الجروبات للمالك في الخاص
            if (text === '!كل الجروبات') {
                const now = Date.now();
                let report = `${botPrefix}📋 *تقرير كل الجروبات المسجلة:*\n\n`;
                let activeCount = 0, expiredCount = 0, neverCount = 0;

                for (const gId in groupSettings) {
                    const gs = groupSettings[gId];
                    let statusLine = '';
                    if (!gs.expireAt) {
                        statusLine = '⚫ لم يُفعل أبداً';
                        neverCount++;
                    } else if (gs.expireAt > now) {
                        const dLeft = Math.ceil((gs.expireAt - now) / (1000 * 60 * 60 * 24));
                        statusLine = `🟢 مفعل (${dLeft} يوم متبقي)`;
                        activeCount++;
                    } else {
                        statusLine = '🔴 منتهي';
                        expiredCount++;
                    }
                    report += `• ${gId}\n  ${statusLine}\n\n`;
                }

                report += `━━━━━━━━━━━━━━\n`;
                report += `🟢 مفعل: ${activeCount} | 🔴 منتهي: ${expiredCount} | ⚫ غير مفعل: ${neverCount}`;

                // إرسال للمالك في الخاص
                try {
                    const ownerChat = await client.getChatById(`${senderNumber}@c.us`);
                    await ownerChat.sendMessage(report);
                    await chat.sendMessage(`${botPrefix}✅ تم إرسال التقرير إلى خاصك.`);
                } catch (err) {
                    await chat.sendMessage(report); // fallback: إرسال في الجروب
                }
                return;
            }

            if (text === '!ايقاف الكل') {
                groupSettings[chatId] = { ...groupSettings[chatId], links: false, swear: false, merchant: false, stickers: false };
                saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف الميزات.`);
                return;
            }
        }

        // 🛑 البوابة الحديدية
        const settings = groupSettings[chatId];
        if (!settings.expireAt) return;

        if (settings.expireAt && Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                const expiryMsg = `⚠️ *تنبيه من إدارة البوت!*\n\nلقد انتهت فترة اشتراك البوت في هذا الجروب، وتم إيقاف أنظمة الحماية والرد التلقائي.\n\nللاستمرار يرجى تجديد الاشتراك بإحدى الباقات:\n1️⃣ *باقة الأسبوع (7 أيام)*\n2️⃣ *باقة الشهر (30 يوم)*\n\n📞 للتواصل مع الإدارة يرجى إرسال رسالة في الخاص.`;
                await chat.sendMessage(expiryMsg);
                groupSettings[chatId].expiredNotified = true;
                saveSettings();
            }
            return;
        }

        // 🌟 أوامر الأعضاء العاديين 🌟
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }

        if (text === '!انذاراتي') {
            const count = userWarnings[senderId] || 0;
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ عدد إنذاراتك: ${count} من أصل 3.`, { mentions: [senderId] });
            return;
        }

        if (text === '!ملصق' && settings.stickers && msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.mimetype.includes('image')) {
                    await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير', stickerAuthor: 'Dark Fire Bot' });
                }
            } catch (error) {}
            return;
        }

        // 🌟 نظام الحماية والتوثيق 🌟
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
                    await chat.sendMessage(`${botPrefix}✅ مبروك! تم توثيقك كتاجر معتمد في الجروب.`);
                }
            }
        }

        let isSenderAdmin = chat.participants.find(p => p.id._serialized === senderId)?.isAdmin || chat.participants.find(p => p.id._serialized === senderId)?.isSuperAdmin;
        const isImmune = isSenderAdmin || msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber);
        if (isImmune) return;

        if (settings.swear && cleanText(msg.body).split(/\s+/).some(word => cleanedBadWords.includes(word))) {
            try { await msg.delete(true); } catch (error) {}
            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nالشتائم ممنوعة.`, { mentions: [senderId] });
            return;
        }

        if (settings.links && /(https?:\/\/[^\s]+)/g.test(msg.body)) {
            try { await msg.delete(true); } catch (error) {}
            userWarnings[senderId] = (userWarnings[senderId] || 0) + 1;
            saveWarnings();
            const warningsCount = userWarnings[senderId];

            if (warningsCount < 3) {
                await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع إرسال الروابط.\nتحذير ${warningsCount} من 3.`, { mentions: [senderId] });
            } else {
                let isKicked = false;
                try { await chat.removeParticipants([senderId]); isKicked = true; userWarnings[senderId] = 0; saveWarnings(); } catch (error) {}
                await chat.sendMessage(isKicked ? `${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه التحذيرات.` : `${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 تحذيرات!\n(يرجى من المشرفين طرده).`, { mentions: [senderId] });
            }
        }

    } catch (err) { console.error('حدث خطأ صامت:', err.message); }
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
