const crypto = require('crypto');
global.crypto = crypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const path = require('path');

// منع السيرفر من الانهيار وإظهار الأخطاء الحقيقية
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

// --- إنشاء مجلد data ---
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

// البدء بجلسة رقم 6 نظيفة تماماً للهروب من الملفات المعطوبة
const sessionPath = path.join(dataPath, 'session_v6');

// --- 1. الإعدادات الأساسية ---
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
        try {
            groupSettings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            groupSettings = {};
        }
    }
}
loadSettings();

// --- 2. دالة التشغيل ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        // الحل الأساسي: استخدام تعريف متصفح يدوي بسيط لا يسبب تعارض مع نسختك
        browser: ['Chrome (Linux)', '', ''], 
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        // ننتظر 3 ثواني فقط بدلاً من 5
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_PHONE_NUMBER.trim());
                console.log(`\n========================================`);
                console.log(`🔑 كود الربط الخاص بك هو: ${code}`);
                console.log(`📱 افتح الواتساب > الأجهزة المرتبطة > ربط باستخدام رقم الهاتف`);
                console.log(`========================================\n`);
            } catch (err) {
                // الآن إذا فشل لن يدخل في دوامة، بل سيطبع لك السبب الحقيقي
                console.log('❌ فشل في جلب كود الربط. السبب الحقيقي:', err.message || err);
            }
        }, 3000); 
    }

    // --- 3. مراقبة حالة الاتصال ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`⚠️ تم إغلاق الاتصال. كود الخطأ: ${statusCode}`);

            if (shouldReconnect) {
                console.log('🔄 جاري إعادة المحاولة بعد 10 ثواني (لمنع التكرار السريع)...');
                setTimeout(() => {
                    startBot();
                }, 10000); 
            } else {
                console.log('❌ تم تسجيل الخروج! سيتم حذف الجلسة للبدء من جديد.');
                fs.rmSync(sessionPath, { recursive: true, force: true });
                setTimeout(() => {
                    startBot();
                }, 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ البوت متصل الآن بنجاح ويعمل بكفاءة!');
        }
    });

    // --- 4. نظام توثيق التجار ---
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
                        await sock.sendMessage(groupId, { 
                            text: `⚠️ إنذار أخير @${user.split('@')[0]}! بقي 3 دقائق.`,
                            mentions: [user]
                        });
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

    // --- 5. استقبال الرسائل ---
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

// --- 6. الخادم ---
const app = express();
app.get('/', (req, res) => res.send('🚀 الخادم يعمل بنجاح!'));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`🌐 خادم الويب يعمل بنجاح`);
    startBot();
});
