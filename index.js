const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// =========================================
// 🗄️ قواعد البيانات
// =========================================
const dbFile = './warnings.json';
let userWarnings = {};
if (fs.existsSync(dbFile)) { userWarnings = JSON.parse(fs.readFileSync(dbFile, 'utf8')); }
function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }

const settingsFile = './settings.json';
let groupSettings = {};
if (fs.existsSync(settingsFile)) { groupSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }

// =========================================
// 👑 أرقام المالك
// =========================================
const MY_ADMIN_IDS =[
    "201092996413@c.us", 
    "27041768431630@lid" 
]; 

// 🔥 التعديل الجديد هنا: إضافة أوامر لتخفيف استهلاك السيرفر (منع الانهيار)
const client = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args:[
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // يمنع امتلاء الذاكرة المؤقتة للسيرفر
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // يجعله يعمل في مسار واحد خفيف
            '--disable-gpu'
        ] 
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
    console.log('امسك هاتفك وافتح واتساب، ثم امسح كود الـ QR هذا (للمرة الأولى والأخيرة)');
});

client.on('ready', () => {
    console.log('✅ مبروك! بوت (دارك فاير) جاهز ويعمل الآن بنسخته التجارية المتقدمة (نسخة خفيفة).');
});

// 🔥 إضافة ميزة إعادة التشغيل التلقائي إذا طرده واتساب لأي سبب
client.on('disconnected', (reason) => {
    console.log('تم فصل البوت، جاري إعادة التشغيل...', reason);
    client.initialize();
});

const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";

const rulesText = `لائحة القوانين:
1. ممنوع إرسال لينكات 🟥
2. شتائم = كيك (طرد) 🟥
3. صلِّ على النبي في قلبك كده، واذكر الله.`;

const badWords =['شرموط', 'متناك', 'غبي', 'حمار', 'كلب']; 
function cleanText(text) {
    let t = text.toLowerCase();
    t = t.replace(/[\u0617-\u061A\u064B-\u0652]/g, ""); 
    t = t.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"); 
    t = t.replace(/[^a-zA-Z\u0621-\u064A\s]/g, ""); 
    t = t.replace(/(.)\1+/gu, "$1"); 
    return t;
}
const cleanedBadWords = badWords.map(word => cleanText(word));

const pendingMerchants = {}; 

client.on('group_join', async (notification) => {
    try {
        const chatId = notification.chatId;
        if (!groupSettings[chatId] || !groupSettings[chatId].merchant) return;

        const joinedUserId = notification.recipientIds[0];
        const chat = await client.getChatById(chatId);
        const userNumber = joinedUserId.split('@')[0];

        const welcomeMsg = `${botPrefix}أهلاً بك (@${userNumber}) في جروب التجار! 👋\n\n`
            + `⚠️ **نظام الحماية والتوثيق:**\n`
            + `أمامك بالضبط (10 دقائق) لإثبات أنك تاجر ولست زبوناً.\n`
            + `قم بإرسال رسالة تعمل فيها (منشن @) لـ 5 تجار كضمان لك.\n`
            + `⏳ إذا لم تفعل ذلك، سيُطردك البوت تلقائياً.\n\n${rulesText}`;

        await chat.sendMessage(welcomeMsg, { mentions: [joinedUserId] });

        const userKey = `${chatId}_${joinedUserId}`;

        const warningTimer = setTimeout(async () => {
            if (pendingMerchants[userKey]) {
                await chat.sendMessage(`${botPrefix}⚠️ تنبيه أخير (@${userNumber})!\nمتبقي لك دقيقة واحدة فقط لعمل منشن لـ 5 تجار أو سيتم طردك!`, { mentions: [joinedUserId] });
            }
        }, 9 * 60 * 1000);

        const kickTimer = setTimeout(async () => {
            if (pendingMerchants[userKey]) {
                try {
                    await chat.removeParticipants([joinedUserId]);
                    await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${userNumber}) لعدم توثيق نفسه كتاجر خلال 10 دقائق.`, { mentions: [joinedUserId] });
                } catch (err) {}
                delete pendingMerchants[userKey];
            }
        }, 10 * 60 * 1000);

        pendingMerchants[userKey] = { warningTimer: warningTimer, kickTimer: kickTimer };
    } catch (error) {}
});

client.on('message_create', async msg => {
    const chat = await msg.getChat();
    
    let rawSenderId;
    if (msg.fromMe) {
        rawSenderId = client.info.wid._serialized; 
    } else {
        rawSenderId = msg.author || msg.from;
    }

    const senderId = rawSenderId.replace(/:\d+/, "");
    const senderNumber = senderId.split('@')[0];
    const chatId = chat.id._serialized;
    const text = msg.body.trim();

    if (chat.isGroup) {
        
        if (text.includes('تفعيل') || text.includes('ايقاف')) {
            console.log(`\n🚨 --- [تم التقاط أمر] --- 🚨`);
            console.log(`النص المكتوب: "${text}"`);
            console.log(`الرقم الذي أرسل الأمر: ${senderId}`);
            console.log(`هل تم التعرف عليه كمدير؟ ${MY_ADMIN_IDS.includes(senderId)}`);
            console.log(`------------------------------\n`);
        }

        if (MY_ADMIN_IDS.includes(senderId)) {
            if (!groupSettings[chatId]) {
                groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false };
            }

            if (text === '!تفعيل الروابط') {
                groupSettings[chatId].links = true; saveSettings();
                await chat.sendMessage(`${botPrefix}✅ تم تفعيل ميزة (حماية الروابط) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الشتائم') {
                groupSettings[chatId].swear = true; saveSettings();
                await chat.sendMessage(`${botPrefix}✅ تم تفعيل ميزة (مكافحة الشتائم) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل التجار') {
                groupSettings[chatId].merchant = true; saveSettings();
                await chat.sendMessage(`${botPrefix}✅ تم تفعيل ميزة (نظام توثيق التجار) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الملصقات') {
                groupSettings[chatId].stickers = true; saveSettings();
                await chat.sendMessage(`${botPrefix}✅ تم تفعيل ميزة (صانع الملصقات) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الكل') {
                groupSettings[chatId] = { links: true, swear: true, merchant: true, stickers: true }; saveSettings();
                await chat.sendMessage(`${botPrefix}✅🔥 تم تفعيل **جميع ميزات البوت** بنجاح لهذا الجروب.`); return;
            }
            if (text === '!ايقاف الكل') {
                groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false }; saveSettings();
                await chat.sendMessage(`${botPrefix}🛑 تم إيقاف جميع الميزات. البوت الآن في وضع السكون في هذا الجروب.`); return;
            }
        }

        const settings = groupSettings[chatId] || { links: false, swear: false, merchant: false, stickers: false };

        if (text === '!قوانين') {
            await chat.sendMessage(`${botPrefix}${rulesText}`); return;
        }
        if (text === '!انذاراتي') {
            const count = userWarnings[senderId] || 0;
            await chat.sendMessage(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ عدد إنذاراتك الحالية هو: ${count} من أصل 3.`, { mentions: [senderId] }); return;
        }

        if (text === '!ملصق') {
            if (!settings.stickers) return; 
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media && media.mimetype.includes('image')) {
                        await chat.sendMessage(media, { sendMediaAsSticker: true, stickerName: 'دارك فاير', stickerAuthor: 'Dark Fire Bot' });
                    }
                } catch (error) {}
            }
            return;
        }

        if (settings.merchant) {
            const userKey = `${chatId}_${senderId}`;
            if (pendingMerchants[userKey]) {
                const mentions = await msg.getMentions();
                if (mentions.length >= 5) {
                    clearTimeout(pendingMerchants[userKey].warningTimer);
                    clearTimeout(pendingMerchants[userKey].kickTimer);
                    delete pendingMerchants[userKey];
                    await chat.sendMessage(`${botPrefix}✅ مبروك! تم توثيقك كتاجر معتمد في الجروب.\nتذكر الالتزام بالقوانين.`);
                }
            }
        }

        let isSenderAdmin = false;
        for (let participant of chat.participants) {
            if (participant.id._serialized === senderId) {
                isSenderAdmin = participant.isAdmin || participant.isSuperAdmin;
                break;
            }
        }
        if (isSenderAdmin && !MY_ADMIN_IDS.includes(senderId)) return; 

        if (settings.swear) {
            const normalizedMessage = cleanText(msg.body); 
            const messageWords = normalizedMessage.split(/\s+/); 
            const containsBadWord = messageWords.some(word => cleanedBadWords.includes(word));

            if (containsBadWord) {
                try { await msg.delete(true); } catch (error) {}
                await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\n\nقال رسول الله صلى الله عليه وسلم: «لَيْسَ المُؤْمِنُ بِالطَّعَّانِ، وَلَا اللَّعَّانِ، وَلَا الْفَاحِشِ، وَلَا الْبَذِيءِ»`, { mentions:[senderId] });
                return; 
            }
        }

        if (settings.links) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            if (urlRegex.test(msg.body)) {
                try { await msg.delete(true); } catch (error) {}

                if (!userWarnings[senderId]) userWarnings[senderId] = 0;
                userWarnings[senderId] += 1;
                saveWarnings();

                const warningsCount = userWarnings[senderId];

                if (warningsCount < 3) {
                    await chat.sendMessage(`${botPrefix}⚠️ تحذير (@${senderNumber})!\nيُمنع إرسال الروابط.\nهذا هو التحذير رقم ${warningsCount} من أصل 3.`, { mentions: [senderId] });
                } else {
                    let isKicked = false;
                    try {
                        await chat.removeParticipants([senderId]);
                        isKicked = true;
                        userWarnings[senderId] = 0;
                        saveWarnings();
                    } catch (error) {}

                    if (isKicked) {
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه الحد الأقصى من تحذيرات الروابط.`, { mentions:[senderId] });
                    } else {
                        await chat.sendMessage(`${botPrefix}🚫 العضو (@${senderNumber}) تجاوز 3 تحذيرات!\n(يرجى من المشرفين طرده).`, { mentions:[senderId] });
                    }
                }
            }
        }
    }
});

client.initialize();

process.on('SIGINT', async () => {
    console.log('\n🛑 جاري إغلاق البوت بشكل آمن...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
});
