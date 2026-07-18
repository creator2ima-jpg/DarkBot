const crypto = require('crypto');
global.crypto = crypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const path = require('path');

// --- إنشاء مجلد data إذا لم يكن موجوداً لحفظ الملفات على Railway ---
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

// --- 1. الإعدادات الأساسية ---
const ADMIN_NUMBERS = ['201092996413@s.whatsapp.net']; 
const BOT_PHONE_NUMBER = '201091885491'; 
const PROFANITY_LIST = ['عرص', 'خول', 'معرص', 'متناك', 'شرموط', 'منيوك', 'خولات', 'معرصين', 'طيزك'];

let groupSettings = {}; 
let pendingMerchants = {}; 
let isRequestingCode = false; 

function saveSettings() {
    fs.writeFileSync(path.join(dataPath, 'settings.json'), JSON.stringify(groupSettings, null, 2));
}

function loadSettings() {
    const settingsFile = path.join(dataPath, 'settings.json');
    if (fs.existsSync(settingsFile)) {
        try {
            groupSettings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('خطأ في قراءة ملف الإعدادات:', error);
            groupSettings = {};
        }
    }
}
loadSettings();

// --- 2. دالة تشغيل البوت الأساسية ---
async function startBot() {
    // تحديد مسار حفظ جلسة الواتساب داخل مجلد data
    const { state, saveCreds } = await useMultiFileAuthState(path.join(dataPath, 'auth_info_baileys'));

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, 
        browser: ['Ubuntu', 'Chrome', '20.0.04'], 
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered && !isRequestingCode) {
        isRequestingCode = true; 
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_PHONE_NUMBER);
                console.log(`\n========================================`);
                console.log(`🔑 كود الربط الخاص بك هو: ${code}`);
                console.log(`📱 افتح الواتساب > الأجهزة المرتبطة > ربط باستخدام رقم الهاتف`);
                console.log(`========================================\n`);
            } catch (err) {
                console.log('حدث خطأ أثناء طلب كود الربط:', err.message);
                isRequestingCode = false; 
            }
        }, 5000); 
    }

    // --- 3. مراقبة حالة الاتصال ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ انقطع الاتصال، جاري إعادة المحاولة بعد 5 ثواني...');
            isRequestingCode = false; 
            
            if (shouldReconnect) {
                setTimeout(() => {
                    startBot();
                }, 5000); 
            } else {
                console.log('❌ تم تسجيل الخروج من الجهاز، يرجى حذف مجلد auth_info_baileys وإعادة الربط.');
            }
        } else if (connection === 'open') {
            console.log('✅ البوت متصل الآن بنجاح ويعمل بكفاءة!');
            isRequestingCode = false;
        }
    });

    // --- 4. نظام توثيق التجار ---
    sock.ev.on('group-participants.update', async (update) => {
        const { id: groupId, participants, action } = update;

        if (action === 'add') {
            for (let user of participants) {
                await sock.sendMessage(groupId, { 
                    text: `أهلاً بك @${user.split('@')[0]}\nأمامك 30 دقيقة لإثبات هويتك كتاجر عبر عمل "منشن" لـ 5 تجار في رسالة واحدة، وإلا سيتم إخراجك تلقائياً للحفاظ على جودة المجموعة.`,
                    mentions: [user] 
                });

                const warningTimer = setTimeout(async () => {
                    if (pendingMerchants[user] && pendingMerchants[user].groupId === groupId) {
                        await sock.sendMessage(groupId, { 
                            text: `⚠️ إنذار أخير @${user.split('@')[0]}! بقي 3 دقائق فقط لعمل منشن لـ 5 تجار.`,
                            mentions: [user]
                        });
                    }
                }, 27 * 60 * 1000);

                const kickTimer = setTimeout(async () => {
                    if (pendingMerchants[user] && pendingMerchants[user].groupId === groupId) {
                        await sock.sendMessage(groupId, { text: `انتهى الوقت. سيتم إخراج الرقم لعدم التوثيق.` });
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
                await sock.sendMessage(groupId, { text: `🚫 تم طرد العضو لإرساله روابط.` });
            } else if (isUrl) {
                await sock.sendMessage(groupId, { text: `🚫 يُمنع إرسال الروابط هنا!` });
            }

            if (hasProfanity) {
                await sock.sendMessage(groupId, { text: `🚫 يرجى الالتزام بالآداب العامة!` });
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
                        await sock.sendMessage(groupId, { text: '✅ تم تفعيل نظام الروابط: (حذف فقط)' });
                    } else if (args.includes('الروابط طرد')) {
                        groupSettings[groupId].linkSystem = 'طرد';
                        await sock.sendMessage(groupId, { text: '🚨 تم تفعيل نظام الروابط: (طرد مباشر)' });
                    }
                    saveSettings();
                    break;

                case '!تفعيل':
                    let days = 0;
                    if (args === '1') days = 5;
                    else if (args === '2') days = 7;
                    else if (args === 'الكل') days = 30; 

                    if (days > 0) {
                        const expire = new Date();
                        expire.setDate(expire.getDate() + days);
                        groupSettings[groupId].isActive = true;
                        groupSettings[groupId].expireDate = expire;
                        saveSettings();
                        await sock.sendMessage(groupId, { text: `✅ تم تفعيل البوت في هذه المجموعة لمدة ${days} أيام.` });
                    }
                    break;

                case '!اذاعة':
                    if (!args) {
                        await sock.sendMessage(groupId, { text: '❌ يرجى كتابة الرسالة بعد الأمر. مثال: !اذاعة عرض خاص' });
                        return;
                    }
                    await sock.sendMessage(groupId, { text: 'جاري الإرسال لكل المجموعات المفعلة...' });
                    
                    let delay = 1000;
                    for (const gid in groupSettings) {
                        if (groupSettings[gid].isActive) {
                            setTimeout(async () => {
                                await sock.sendMessage(gid, { text: `📢 إعلان إداري:\n\n${args}` });
                            }, delay);
                            delay += 3000; 
                        }
                    }
                    break;

                case '!فحص':
                    const status = groupSettings[groupId].isActive ? 'مفعل ✅' : 'منتهي ❌';
                    const linkSys = groupSettings[groupId].linkSystem;
                    await sock.sendMessage(groupId, { text: `📊 حالة الجروب:\nالاشتراك: ${status}\nنظام الروابط: ${linkSys}` });
                    break;
            }
        }
    });
}

// --- 6. تشغيل خادم الويب السحابي ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🚀 الخادم يعمل بنجاح! البوت متصل الآن.');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 خادم الويب يعمل على المنفذ: ${port}`);
    startBot(); 
});
