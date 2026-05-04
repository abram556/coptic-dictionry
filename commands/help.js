/**
 * help.js — قائمة الأوامر الاحترافية مع قائمة تفاعلية
 */

const settings = require('../settings');
const { sendListMessage } = require('../lib/buttons');
const { dbSize }          = require('../lib/phoneDb');
const { subscribersCount } = require('../lib/subscribersDb');

async function helpCommand(sock, chatId, message, pushname, isAdminUser) {
    try {
        await sock.sendMessage(chatId, { react: { text: '📋', key: message.key } });

        const name = pushname || 'مستخدم';

        const sections = [
            {
                title: '🔍 البحث',
                rows: [
                    { id: '/lookup', title: '/lookup', description: 'البحث برقم الموبايل مع صورة' }
                ]
            },
            {
                title: '📌 عام',
                rows: [
                    { id: '/start', title: '/start', description: 'الترحيب والبداية' },
                    { id: '/owner', title: '/owner', description: 'التواصل مع المالك' }
                ]
            }
        ];

        if (isAdminUser) {
            sections.push({
                title: '📂 إدارة البيانات (أدمن)',
                rows: [
                    { id: '/uploaddb',   title: '/uploaddb',    description: 'رفع ملف بيانات xlsx' },
                    { id: '/adddata',    title: '/adddata',     description: 'إضافة سجل واحد تفاعلياً' },
                    { id: '/addbatch',   title: '/addbatch',    description: 'إضافة دفعة سجلات دفعة واحدة' },
                    { id: '/delete رقم', title: '/delete رقم', description: 'حذف سجل من قاعدة البيانات' },
                    { id: '/dbstats',    title: '/dbstats',     description: 'إحصائيات + تصدير xlsx' }
                ]
            });
            sections.push({
                title: '👥 المشتركون (أدمن)',
                rows: [
                    { id: '/subscribers', title: '/subscribers', description: 'تصدير قائمة المشتركين xlsx' },
                    { id: '/broadcast',   title: '/broadcast',   description: 'إرسال رسائل جماعية للمشتركين' }
                ]
            });
            sections.push({
                title: '🔧 إعدادات (أدمن)',
                rows: [
                    { id: '/logout', title: '/logout', description: 'تسجيل الخروج من صلاحيات الأدمن' }
                ]
            });
        }

        const bodyText = isAdminUser
            ? `أهلاً *${name}* 👑\n\n📊 السجلات: *${dbSize()}* | 👥 المشتركون: *${subscribersCount()}*\n\nاختر الأمر من القائمة:`
            : `أهلاً *${name}* 🌟\n\nاختر الأمر أو أرسل رقم الهاتف مباشرة للبحث الفوري 🔍`;

        await sendListMessage(
            sock, chatId, message,
            `🤖 ${settings.botName} v${settings.version}`,
            bodyText,
            `${settings.botName} — ${settings.mode}`,
            '📋 عرض الأوامر',
            sections
        );

    } catch (err) {
        console.error('❌ help error:', err);
        const helpText =
            `*╭━━━〔 🤖 ${settings.botName} 〕━━━┈⊷*\n` +
            `*┃🤖│ /start    — الترحيب*\n` +
            `*┃🤖│ /lookup   — البحث بالرقم 🔍*\n` +
            `*┃🤖│ /owner    — تواصل مع المالك 👑*\n` +
            `*┃🤖│ /menu     — هذه القائمة*\n` +
            `*╰━━━━━━━━━━━━━━━┈⊷*\n\n` +
            `_💡 أرسل رقم الهاتف مباشرة للبحث الفوري_`;
        await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
    }
}

module.exports = helpCommand;
