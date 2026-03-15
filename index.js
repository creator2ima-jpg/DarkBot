const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// =========================================
// 🗄️ قواعد البيانات (الإنذارات + التراخيص)
// =========================================
const dbFile = './warnings.json';
let userWarnings = {};
if (fs.existsSync(dbFile)) {
    userWarnings = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}
function saveWarnings() { fs.writeFileSync(dbFile, JSON.stringify(userWarnings, null, 2)); }

const settingsFile = './settings.json';
let groupSettings = {};
if (fs.existsSync(settingsFile)) {
    groupSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
}
function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(groupSettings, null, 2)); }

// =========================================
// 👑 رقم المالك (المدير العام)
// =========================================
const MY_ADMIN_ID = "201092996413@c.us"; 

const client = new Client({ 
    authStrategy: new LocalAuth(),
    puppeteer: { args:['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
    console.log('امسك هاتفك وافتح واتساب، ثم امسح كود الـ QR هذا (للمرة الأولى والأخيرة)');
});

client.on('ready', () => {
    console.log('✅ مبروك! بوت (دارك فاير) جاهز ويعمل الآن بنسخته التجارية المتقدمة.');
});

const botPrefix = "بوت دارك فاير | Dark Fire Bot \n\n";

// 📜 القوانين والشتائم
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

// =========================================
// 👋 نظام التجار والأعضاء الجدد
// =========================================
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

// =========================================
// 🛡️ المراقبة المركزية والتحكم
// =========================================
client.on('message_create', async msg => {
    const chat = await msg.getChat();
    
    // 🟢 استخراج رقم المرسل الخام
    let rawSenderId;
    if (msg.fromMe) {
        rawSenderId = client.info.wid._serialized; 
    } else {
        rawSenderId = msg.author || msg.from;
    }

    // 🔥 السطر السحري: قص أي زيادات يضعها واتساب بسبب الأجهزة المتعددة (مثل :5)
    const senderId = rawSenderId.replace(/:\d+/, "");
    
    const senderNumber = senderId.split('@')[0];
    const chatId = chat.id._serialized;
    const text = msg.body.trim();

    if (chat.isGroup) {
        
        // 🟢 [رادار كشف الأخطاء] سيعمل في شاشة Railway السوداء
        if (text.startsWith('!تفعيل') || text.startsWith('!ايقاف')) {
            console.log(`\n🚨[محاولة تشغيل أمر من المالك]`);
            console.log(`الرقم الذي أرسل الأمر: ${senderId}`);
            console.log(`هل تم التعرف عليه كمدير؟ ${senderId === MY_ADMIN_ID}\n`);
        }

        // =========================================
        // 🛠️ لوحة تحكم المالك (01092996413)
        // =========================================
        if (senderId === MY_ADMIN_ID) {
            if (!groupSettings[chatId]) {
                groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false };
            }

            if (text === '!تفعيل الروابط') {
                groupSettings[chatId].links = true; saveSettings();
                await msg.reply(`${botPrefix}✅ تم تفعيل ميزة (حماية الروابط) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الشتائم') {
                groupSettings[chatId].swear = true; saveSettings();
                await msg.reply(`${botPrefix}✅ تم تفعيل ميزة (مكافحة الشتائم) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل التجار') {
                groupSettings[chatId].merchant = true; saveSettings();
                await msg.reply(`${botPrefix}✅ تم تفعيل ميزة (نظام توثيق التجار) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الملصقات') {
                groupSettings[chatId].stickers = true; saveSettings();
                await msg.reply(`${botPrefix}✅ تم تفعيل ميزة (صانع الملصقات) بنجاح لهذا الجروب.`); return;
            }
            if (text === '!تفعيل الكل') {
                groupSettings[chatId] = { links: true, swear: true, merchant: true, stickers: true }; saveSettings();
                await msg.reply(`${botPrefix}✅🔥 تم تفعيل **جميع ميزات البوت** بنجاح لهذا الجروب.`); return;
            }
            if (text === '!ايقاف الكل') {
                groupSettings[chatId] = { links: false, swear: false, merchant: false, stickers: false }; saveSettings();
                await msg.reply(`${botPrefix}🛑 تم إيقاف جميع الميزات. البوت الآن في وضع السكون في هذا الجروب.`); return;
            }
        }

        const settings = groupSettings[chatId] || { links: false, swear: false, merchant: false, stickers: false };

        if (text === '!قوانين') {
            await msg.reply(`${botPrefix}${rulesText}`); return;
        }
        if (text === '!انذاراتي') {
            const count = userWarnings[senderId] || 0;
            await msg.reply(`${botPrefix}👤 أهلاً بك (@${senderNumber})\n⚠️ عدد إنذاراتك الحالية هو: ${count} من أصل 3.`, { mentions: [senderId] }); return;
        }

        if (text === '!ملصق') {
            if (!settings.stickers) return; 
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media && media.mimetype.includes('image')) {
                        await msg.reply(media, chatId, { sendMediaAsSticker: true, stickerName: 'دارك فاير', stickerAuthor: 'Dark Fire Bot' });
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
                    await msg.reply(`${botPrefix}✅ مبروك! تم توثيقك كتاجر معتمد في الجروب.\nتذكر الالتزام بالقوانين.`);
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
        if (isSenderAdmin && senderId !== MY_ADMIN_ID) return; 

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
                        await chat.sendMessage(`${botPrefix}🚫 تم طرد (@${senderNumber}) لتجاوزه الحد الأقصى من تحذيرات الروابط.`, { mentions: [senderId] });
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
