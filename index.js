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

let userWarnings = {};
if (fs.existsSync(dbFile)) { userWarnings = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } 
else { fs.writeFileSync(dbFile, JSON.stringify({})); }
function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }

let groupSettings = {};
if (fs.existsSync(settingsFile)) { groupSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } 
else { fs.writeFileSync(settingsFile, JSON.stringify({})); }
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }

// =========================================
// 👑 2. أرقام المالك (ضع أرقامك هنا)
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
// 🚀 4. إعدادات البوت والاتصال (مضاد الانهيار)
// =========================================
const client = new Client({ 
    authStrategy: new LocalAuth({ dataPath: dataPath }), 
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' },
    puppeteer: { 
        headless: true,
        args:['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu', '--memory-pressure-off', '--js-flags="--max-old-space-size=250"', '--disk-cache-size=0', '--disable-application-cache', '--disable-offline-load-stale-cache'] 
    }
});

client.on('qr', qr => { qrcode.generate(qr, {small: true}); console.log('امسح كود الـ QR'); });
client.on('ready', () => { console.log('✅ البوت جاهز ويعمل بنظام الباقات التجارية.'); });
client.on('disconnected', async () => { try { await client.destroy(); client.initialize(); } catch (err) {} });
process.on('unhandledRejection', () => {}); process.on('uncaughtException', () => {});

// =========================================
// ⚙️ 5. إعدادات القوانين والكلمات المسيئة
// =========================================
const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";
const rulesText = `لائحة القوانين:\n1. ممنوع إرسال لينكات 🟥\n2. شتائم = كيك (طرد) 🟥\n3. صلِّ على النبي في قلبك كده، واذكر الله.`;

const badWords =['شرموط', 'متناك', 'غبي', 'حمار', 'كلب']; 
function cleanText(text) {
    let t = text.toLowerCase().replace(/[\u0617-\u061A\u064B-\u0652]/g, ""); 
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"); 
    return t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, "").replace(/(.)\1+/gu, "$1"); 
}
const cleanedBadWords = badWords.map(word => cleanText(word));
const pendingMerchants = {}; 

// =========================================
// 🛡️ 6. نظام توثيق التجار (عند الانضمام)
// =========================================
client.on('group_join', async (notification) => {
    try {
        const chatId = notification.chatId;
        const settings = groupSettings[chatId];
        // البوابة: لا يعمل إذا كان الجروب غير مفعل أو انتهى اشتراكه
        if (!settings || !settings.merchant || !settings.expireAt || Date.now() > settings.expireAt) return;

        const joinedUserId = notification.recipientIds[0];
        const chat = await client.getChatById(chatId);
        const userNumber = joinedUserId.split('@')[0];

        const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\nأمامك (10 دقائق) لإثبات أنك تاجر ولست زبوناً.\nقم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار كضمان لك.\n⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;
        await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

        const userKey = `${chatId}_${joinedUserId}`;
        const warningTimer = setTimeout(async () => { if (pendingMerchants[userKey]) await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي دقيقة لعمل منشن لـ 5 تجار أو سيتم طردك!`, { mentions: [joinedUserId] }); }, 9 * 60 * 1000);
        const kickTimer = setTimeout(async () => { if (pendingMerchants[userKey]) { try { await chat.removeParticipants([joinedUserId]); await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه.`, { mentions:[joinedUserId] }); } catch (err) {} delete pendingMerchants[userKey]; } }, 10 * 60 * 1000);
        pendingMerchants[userKey] = { warningTimer, kickTimer };
    } catch (error) {}
});

// =========================================
// 📩 7. نظام استقبال الرسائل والأوامر
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
            groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false, expireAt: null, expiredNotified: false };
        }

        // 🌟 أوامر المالك فقط (تعمل في أي وقت) 🌟
        if (isBotOwner) {
            
            if (text.startsWith('!تفعيل')) {
                const packageType = text.split(' ')[1];
                let daysToAdd = 0;
                let packageName = "";

                if (packageType === '1') { daysToAdd = 5; packageName = "الفترة التجريبية (5 أيام مجاناً) 🎁"; } 
                else if (packageType === '2') { daysToAdd = 7; packageName = "باقة الأسبوع (7 أيام) 🥉"; } 
                else if (packageType === '3') { daysToAdd = 30; packageName = "باقة الشهر (30 يوم) 🥇"; } 
                else {
                    await chat.sendMessage(`${botPrefix}⚠️ خطأ! الباقات المتاحة:\n!تفعيل 1 (5 أيام مجاناً)\n!تفعيل 2 (7 أيام)\n!تفعيل 3 (30 يوم)`); return;
                }

                const now = Date.now();
                const baseTime = (groupSettings[chatId].expireAt && groupSettings[chatId].expireAt > now) ? groupSettings[chatId].expireAt : now;
                const newExpireAt = baseTime + (daysToAdd * 24 * 60 * 60 * 1000);
                
                // تحديث الاشتراك وتشغيل كل ميزات الحماية تلقائياً
                groupSettings[chatId].expireAt = newExpireAt;
                groupSettings[chatId].expiredNotified = false;
                groupSettings[chatId].links = true; groupSettings[chatId].swear = true; groupSettings[chatId].merchant = true; groupSettings[chatId].stickers = true;
                saveSettings();
                
                const receiptMsg = `✅ *تم تفعيل البوت وحماية الجروب بنجاح!*\n\n📦 *الباقة:* ${packageName}\n⏳ *المدة:* ${daysToAdd} أيام\n📅 *يبدأ من:* ${formatDate(now)}\n🛑 *ينتهي في:* ${formatDate(newExpireAt)}\n\nنتمنى لكم تجربة مميزة مع حماية دارك فاير! 🛡️`;
                await chat.sendMessage(receiptMsg); 
                return;
            }

            if (text === '!الغاء الاشتراك') {
                groupSettings[chatId].expireAt = Date.now() - 1000; groupSettings[chatId].expiredNotified = false; saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إنهاء اشتراك الجروب وإيقاف البوت فوراً!`); return;
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
            
            // أوامر إيقاف وتشغيل يدوية في حال احتجت لها
            if (text === '!ايقاف الكل') { groupSettings[chatId] = { ...groupSettings[chatId], links: false, swear: false, merchant: false, stickers: false }; saveSettings(); await chat.sendMessage(`${botPrefix}🛑 تم إيقاف الميزات.`); return; }
        }

        // 🛑 البوابة الحديدية (لا أحد يمر إذا لم يكن الجروب مفعل) 🛑
        const settings = groupSettings[chatId];
        
        if (!settings.expireAt) return; // صمت تام إذا لم يُفعل أبداً

        if (settings.expireAt && Date.now() > settings.expireAt) {
            if (!settings.expiredNotified) {
                const expiryMsg = `⚠️ *تنبيه من إدارة البوت!*\n\nلقد انتهت فترة اشتراك البوت في هذا الجروب، وتم إيقاف أنظمة الحماية والرد التلقائي.\n\nللاستمرار يرجى تجديد الاشتراك بإحدى الباقات:\n1️⃣ *باقة الأسبوع (7 أيام)*\n2️⃣ *باقة الشهر (30 يوم)*\n\n📞 للتواصل مع الإدارة يرجى إرسال رسالة في الخاص.`;
                await chat.sendMessage(expiryMsg);
                groupSettings[chatId].expiredNotified = true; saveSettings();
            }
            return; // إيقاف البوت هنا ومنع أي أوامر أدناه
        }

        // 🌟 أوامر الأعضاء العاديين (تعمل فقط والاشتراك ساري) 🌟
        if (text === '!قوانين') { await chat.sendMessage(`${botPrefix}${rulesText}`); return; }
        if (text === '!انذاراتي') {
            const count = userWarnings[senderId] || 0;
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ عدد إنذاراتك: ${count} من أصل 3.`, { mentions: [senderId] }); return;
        }

        if (text === '!ملصق' && settings.stickers && msg.hasMedia) {
            try { const media = await msg.downloadMedia(); if (media && media.mimetype.includes('image')) { await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير', stickerAuthor: 'Dark Fire Bot' }); } } catch (error) {} return;
        }

        // 🌟 نظام الحماية والتوثيق 🌟
        if (settings.merchant) {
            const userKey = `${chatId}_${senderId}`;
            if (pendingMerchants[userKey]) {
                const mentions = await msg.getMentions();
                if (mentions.length >= 5) { clearTimeout(pendingMerchants[userKey].warningTimer); clearTimeout(pendingMerchants[userKey].kickTimer); delete pendingMerchants[userKey]; await chat.sendMessage(`${botPrefix}✅ مبروك! تم توثيقك كتاجر معتمد في الجروب.`); }
            }
        }

        let isSenderAdmin = chat.participants.find(p => p.id._serialized === senderId)?.isAdmin || chat.participants.find(p => p.id._serialized === senderId)?.isSuperAdmin;
        const isImmune = isSenderAdmin || msg.fromMe || MY_ADMIN_NUMBERS.includes(senderNumber);
        if (isImmune) return; // حصانة المشرفين والمالك من العقوبات

        if (settings.swear && cleanText(msg.body).split(/\s+/).some(word => cleanedBadWords.includes(word))) {
            try { await msg.delete(true); } catch (error) {}
            await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nالشتائم ممنوعة.`, { mentions:[senderId] }); return; 
        }

        if (settings.links && /(https?:\/\/[^\s]+)/g.test(msg.body)) {
            try { await msg.delete(true); } catch (error) {}
            userWarnings[senderId] = (userWarnings[senderId] || 0) + 1; saveWarnings();
            const warningsCount = userWarnings[senderId];

            if (warningsCount < 3) {
                await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع إرسال الروابط.\nتحذير ${warningsCount} من 3.`, { mentions: [senderId] });
            } else {
                let isKicked = false;
                try { await chat.removeParticipants([senderId]); isKicked = true; userWarnings[senderId] = 0; saveWarnings(); } catch (error) {}
                await chat.sendMessage(isKicked ? `${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه التحذيرات.` : `${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 تحذيرات!\n(يرجى من المشرفين طرده).`, { mentions:[senderId] });
            }
        }

    } catch (err) { console.error('حدث خطأ صامت:', err.message); }
});

client.initialize();
process.on('SIGINT', async () => { try { await client.destroy(); process.exit(0); } catch (err) { process.exit(1); } });
