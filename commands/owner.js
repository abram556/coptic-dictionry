/**
 * owner.js — معلومات المالك مع أزرار
 */

const settings = require('../settings');
const axios    = require('axios');
const { sendButtons } = require('../lib/buttons');

async function ownerCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { react: { text: '👑', key: message.key } });

        const vcard =
            `BEGIN:VCARD\nVERSION:3.0\nFN:${settings.botOwner}\n` +
            `TEL;waid=${settings.ownerNumber}:${settings.ownerNumber}\nEND:VCARD`;

        // محاولة إرسال صورة المالك
        try {
            const res = await axios.get(
                'https://drive.google.com/uc?export=download&id=16fmUHbq-1eUeDA4BIMZrBwr3v76rybpM',
                { responseType: 'arraybuffer', timeout: 15000 }
            );
            await sock.sendMessage(chatId, {
                image:   Buffer.from(res.data, 'binary'),
                caption:
                    `*╭━━━〔 👑 المالك 〕━━━┈⊷*\n` +
                    `*┃🤖│ 👤 الاسم :❯ ${settings.botOwner}*\n` +
                    `*┃🤖│ 📱 الرقم :❯ ${settings.ownerNumber}*\n` +
                    `*┃🤖│ 🤖 البوت :❯ ${settings.botName}*\n` +
                    `*╰━━━━━━━━━━━━━━━┈⊷*`
            }, { quoted: message });
        } catch (_) {}

        // إرسال بطاقة جهة الاتصال
        await sock.sendMessage(chatId, {
            contacts: { displayName: settings.botOwner, contacts: [{ vcard }] }
        });

        // أزرار للتواصل
        await sendButtons(
            sock, chatId, message,
            '👑 تواصل معنا',
            `للتواصل مع المالك ${settings.botOwner}\nاضغط على زر الواتساب أدناه`,
            `${settings.botName} v${settings.version}`,
            [
                { id: `/wa_${settings.ownerNumber}`, text: `📲 واتساب المالك` },
                { id: '/start',                      text: '🏠 القائمة الرئيسية' }
            ]
        );

    } catch (err) {
        console.error('❌ owner error:', err);
        const vcard =
            `BEGIN:VCARD\nVERSION:3.0\nFN:${settings.botOwner}\n` +
            `TEL;waid=${settings.ownerNumber}:${settings.ownerNumber}\nEND:VCARD`;
        await sock.sendMessage(chatId, {
            contacts: { displayName: settings.botOwner, contacts: [{ vcard }] }
        }, { quoted: message });
    }
}

module.exports = ownerCommand;
