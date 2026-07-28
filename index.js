const crypto = require('crypto');
global.crypto = crypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const path = require('path');

// --- 🕵️ نظام صيد الأخطاء المخفية (Crash Catcher) ---
process.on('uncaughtException', (err) => {
    console.error('\n🚨 [عطل برمجي مفاجئ - Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('\n🚨 [عطل في الاتصال - Unhandled Rejection]:', err.message);
});

const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

// استخدام جلسة 8 لضمان بيئة نظيفة للتشخيص
const sessionPath = path.join(dataPath, 'session_v8');

const ADMIN_NUMBERS = ['201155554791@s.whatsapp.net']; 
const BOT_PHONE_NUMBER = '201099906414'; 
const PROFANITY_LIST = ['عرص', 'خول', 'معرص', 'متناك', 'شرموط', 'منيوك', 'خولات', 'معرصين', 'طيزك'];

let groupSettings = {}; 
let pendingMerchants = {}; 

function saveSettings() {
    fs.writeFileSync(path.join(dataPath, 'settings.json'), JSON.stringify(groupSettings, null, 2));
}
function loadSettings() {
    const settingsFile = path.join(dataPath, 'settings.json');
    if (fs.existsSync(settingsFile)) {
        try { groupSettings = JSON.parse(fs.readFileSync(settingsFile)); } catch (error) { groupSettings = {}; }
    }
}
loadSettings();

async function startBot() {
    console.log('\n⚙️ [نظام التشخيص]: جاري بدء تشغيل البوت وقراءة الجلسة...');
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: ['Chrome (Linux)', '', ''], 
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        console.log('⚙️ [نظام التشخيص]: لا يوجد ربط مسبق، جاري طلب كود بعد 3 ثواني...');
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_PHONE_NUMBER.trim());
                console.log(`\n========================================`);
                console.log(`🔑 كود الربط الخاص بك هو: ${code}`);
                console.log(`📱 افتح الواتساب > الأجهزة المرتبطة > ربط باستخدام رقم الهاتف`);
                console.log(`========================================\n`);
            } catch (err) {
                console.log('\n❌ [تشخيص الأعطال - فشل الكود]:');
                console.log('💡 السبب المحتمل: رقم الهاتف غير صحيح، أو السيرفر محظور من واتساب، أو المكتبة قديمة.');
                console.log(`📜 رسالة الخطأ التقنية: ${err.message || err}\n`);
            }
        }, 3000); 
    }

    // --- 🕵️ المترجم الذكي لأكواد واتساب ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMsg = lastDisconnect?.error?.message;
            
            console.log(`\n🔍 [تشخيص الأعطال - انقطاع الاتصال]: كود الخطأ (${statusCode})`);
            
            // ترجمة الأخطاء الشائعة لتسهيل الفهم
            if (statusCode === 405) {
                console.log('💡 السبب (405): واتساب وضع "حظر مؤقت" على رقمك بسبب كثرة محاولات طلب الكود.');
                console.log('🛠️ الحل: يجب إيقاف البوت تماماً لمدة ساعة حتى يفك واتساب الحظر، وتأكد من تحديث المكتبة في package.json.');
                fs.rmSync(sessionPath, { recursive: true, force: true });
                return; // إيقاف اللوب فوراً
            } 
            else if (statusCode === 401) {
                console.log('💡 السبب (401): تم تسجيل خروج البوت من الهاتف، أو الجلسة تالفة.');
                console.log('🛠️ الحل: سيقوم الكود بمسح الجلسة القديمة وطلب كود جديد.');
                fs.rmSync(sessionPath, { recursive: true, force: true });
            } 
            else if (statusCode === 408) {
                console.log('💡 السبب (408): انتهى وقت الطلب (Timeout)، استجابة واتساب بطيئة أو هناك ضعف في انترنت السيرفر.');
            } 
            else if (statusCode === 440) {
                console.log('💡 السبب (440): تعارض (Conflict)! البوت يعمل في سيرفرين أو نافذتين في نفس الوقت.');
            } 
            else if (statusCode === 500) {
                console.log('💡 السبب (500): مشكلة داخلية في سيرفرات واتساب نفسها.');
            } 
            else if (statusCode === 515) {
                console.log('💡 السبب (515): إجراء طبيعي من واتساب لإعادة تنشيط الاتصال (Restart Required).');
            } 
            else {
                console.log(`💡 السبب: غير معروف مسجل في المكتبة. الرسالة التقنية: ${errorMsg}`);
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 405;

            if (shouldReconnect) {
                console.log('🔄 [نظام التشخيص]: سيتم إعادة المحاولة بعد 10 ثواني بهدوء...');
                setTimeout(() => { startBot(); }, 10000); 
            } else {
                console.log('❌ [نظام التشخيص]: لن يتم إعادة الاتصال. تم مسح الجلسة للبدء من الصفر لاحقاً.');
                setTimeout(() => { startBot(); }, 3000);
            }

        } else if (connection === 'open') {
            console.log('\n✅ [نظام التشخيص]: الاتصال مستقر وممتاز! البوت يعمل الآن.');
        }
    });

    // --- أوامر البوت (نظام الروابط والتجار) ---
    sock.ev.on('group-participants.update', async (update) => {
        const { id: groupId, participants, action } = update;
        if (action === 'add') {
            for (let user of participants) {
                await sock.sendMessage(groupId, { 
                    text: `أهلاً بك @${user.split('@')[0]}\nأمامك 30 دقيقة لإثبات هويتك كتاجر عبر عمل "منشن" لـ 5 تجار في رسالة واحدة.`,
                    mentions: [user] 
                });
                const warningTimer = setTimeout(async () => {
                    if (pendingMerchants[user] && pendingMerchants[user].groupId === groupId) {
                        await sock.sendMessage(groupId, { text: `⚠️ إنذار أخير @${user.split('@')[0]}! بقي 3 دقائق.`, mentions: [user] });
                    }
                }, 27 * 60 * 1000);
                const kickTimer = setTimeout(async () => {
                    if (pendingMerchants[user] && pendingMerchants[user].groupId === groupId) {
                        await sock.groupParticipantsUpdate(groupId, [user], 'remove');
                        delete pendingMerchants[user];
                    }
                }, 30 * 60 * 1000);
                pendingMerchants[user] = { groupId, warningTimer, kickTimer };
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        const isGroup = groupId.endsWith('@g.us');
        const isAdmin = ADMIN_NUMBERS.includes(sender);
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (!isGroup) return; 

        if (!groupSettings[groupId]) {
            groupSettings[groupId] = { linkSystem: 'delete', isActive: true, expireDate: null };
            saveSettings();
        }

        if (pendingMerchants[sender] && pendingMerchants[sender].groupId === groupId) {
            const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentionedJids.length >= 5) {
                clearTimeout(pendingMerchants[sender].warningTimer);
                clearTimeout(pendingMerchants[sender].kickTimer);
                delete pendingMerchants[sender];
                await sock.sendMessage(groupId, { text: `✅ تم التوثيق بنجاح! نورتنا.` }, { quoted: msg });
            }
        }

        const isUrl = text.match(/https?:\/\/[^\s]+/gi);
        const hasProfanity = PROFANITY_LIST.some(word => text.includes(word));

        if ((isUrl && !isAdmin) || (hasProfanity && !isAdmin)) {
            await sock.sendMessage(groupId, { delete: msg.key });
            if (isUrl && groupSettings[groupId].linkSystem === 'طرد') {
                await sock.groupParticipantsUpdate(groupId, [sender], 'remove');
            }
            return;
        }

        if (isAdmin && text.startsWith('!')) {
            const command = text.split(' ')[0];
            const args = text.replace(command, '').trim();
            switch (command) {
                case '!نظام':
                    if (args.includes('الروابط حذف')) {
                        groupSettings[groupId].linkSystem = 'حذف';
                        await sock.sendMessage(groupId, { text: '✅ (حذف فقط)' });
                    } else if (args.includes('الروابط طرد')) {
                        groupSettings[groupId].linkSystem = 'طرد';
                        await sock.sendMessage(groupId, { text: '🚨 (طرد مباشر)' });
                    }
                    saveSettings();
                    break;
                case '!تفعيل':
                    let days = args === '1' ? 5 : args === '2' ? 7 : args === 'الكل' ? 30 : 0; 
                    if (days > 0) {
                        const expire = new Date();
                        expire.setDate(expire.getDate() + days);
                        groupSettings[groupId].isActive = true;
                        groupSettings[groupId].expireDate = expire;
                        saveSettings();
                        await sock.sendMessage(groupId, { text: `✅ تم تفعيل البوت ${days} أيام.` });
                    }
                    break;
            }
        }
    });
}

const app = express();
app.get('/', (req, res) => res.send('🚀 الخادم يعمل بنجاح!'));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`🌐 خادم الويب يعمل بنجاح`);
    startBot();
});
