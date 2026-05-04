/**
 * broadcast.js — إرسال رسائل جماعية للمشتركين
 * يُرسل رسالة لكل مشترك مع فاصل ساعة كاملة بين كل رسالة
 * للأدمن فقط
 */

const settings = require('../settings');
const { getAllSubscribers, subscribersCount } = require('../lib/subscribersDb');

const broadcastSessions = new Map();
const SESSION_TIMEOUT   = 5 * 60 * 1000;

const CONFIRM_WORDS = ['نعم', 'yes', 'تأكيد', 'ارسل', 'أرسل', 'ok', 'موافق', '✅', 'y', '1'];
const CANCEL_WORDS  = ['لا', 'no', 'الغاء', 'إلغاء', 'cancel', 'x', '0', '❌'];

const DELAY_MS = settings.BROADCAST_DELAY_MS || 3600000;

let activeBroadcast = false;

async function performBroadcast(sock, chatId, message, senderId, text) {
    const subscribers = getAllSubscribers();
    if (subscribers.length === 0) {
        await sock.sendMessage(chatId, {
            text: `❌ *لا يوجد مشتركون بعد!*\n\nالمشتركون يُسجَّلون تلقائياً عند تفاعلهم مع البوت.`
        }, { quoted: message });
        return;
    }

    if (activeBroadcast) {
        await sock.sendMessage(chatId, {
            text: `⚠️ يوجد بث جماعي نشط بالفعل. انتظر حتى ينتهي.`
        }, { quoted: message });
        return;
    }

    activeBroadcast = true;
    const totalHours = Math.ceil(subscribers.length * (DELAY_MS / 3600000));
    await sock.sendMessage(chatId, {
        text:
            `📤 *بدأ البث الجماعي!*\n\n` +
            `📊 العدد: ${subscribers.length} مشترك\n` +
            `⏱️ الفاصل: ساعة بين كل رسالة\n` +
            `⌛ الوقت المتوقع: ~${totalHours} ساعة\n\n` +
            `ستصلك إشعار عند الانتهاء.`
    }, { quoted: message });

    const broadcastText = `${text}\n\n━━━━━━━━━━━━━━━━━━\n🤖 ${settings.botName}`;
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    let sent   = 0;
    let failed = 0;

    for (const sub of subscribers) {
        try {
            if (sub.jid === (sock.user?.id || '')) continue;
            await sock.sendMessage(sub.jid, { text: broadcastText });
            sent++;
        } catch (err) {
            console.error(`❌ فشل إرسال لـ ${sub.jid}:`, err.message);
            failed++;
        }
        // فاصل ساعة كاملة بين كل رسالة
        await delay(DELAY_MS);
    }

    activeBroadcast = false;
    await sock.sendMessage(chatId, {
        text:
            `✅ *اكتمل البث الجماعي!*\n\n` +
            `✅ تم الإرسال: *${sent}*\n` +
            `❌ فشل: *${failed}*\n` +
            `📊 الإجمالي: *${subscribers.length}*\n` +
            `🕐 ${new Date().toLocaleString('ar-EG')}`
    });
}

async function broadcastCommand(sock, chatId, message, senderId, argsText) {
    try {
        if (activeBroadcast) {
            await sock.sendMessage(chatId, {
                text: `⚠️ يوجد بث جماعي نشط بالفعل.`
            }, { quoted: message });
            return;
        }

        const total = subscribersCount();

        if (argsText && argsText.trim()) {
            broadcastSessions.set(chatId + senderId, {
                step:      'waiting_confirm',
                text:      argsText.trim(),
                timestamp: Date.now()
            });
            await sock.sendMessage(chatId, {
                text:
                    `📢 *تأكيد البث الجماعي*\n\n` +
                    `الرسالة:\n${argsText.trim()}\n\n` +
                    `📊 سيتم الإرسال لـ ${total} مشترك\n` +
                    `⏱️ بفاصل ساعة بين كل رسالة\n\n` +
                    `✅ أرسل "نعم" للتأكيد\n` +
                    `❌ أرسل "لا" للإلغاء`
            }, { quoted: message });
        } else {
            broadcastSessions.set(chatId + senderId, { step: 'waiting_text', timestamp: Date.now() });
            await sock.sendMessage(chatId, {
                text:
                    `📢 *إرسال جماعي*\n\n` +
                    `أرسل الرسالة التي تريد إرسالها\n` +
                    `للمشتركين البالغ عددهم *${total}*\n\n` +
                    `⏳ المهلة: 5 دقائق\n` +
                    `✏️ اكتب الرسالة الآن:`
            }, { quoted: message });
        }
    } catch (err) {
        console.error('❌ broadcastCommand:', err);
    }
}

async function handleBroadcastSession(sock, chatId, message, senderId, text) {
    const key     = chatId + senderId;
    const session = broadcastSessions.get(key);
    if (!session) return false;

    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        broadcastSessions.delete(key);
        return false;
    }

    const lower = text.trim().toLowerCase();
    const total = subscribersCount();

    if (text.trim().startsWith('/')) {
        broadcastSessions.delete(key);
        return false;
    }

    if (session.step === 'waiting_text') {
        if (CANCEL_WORDS.includes(lower)) {
            broadcastSessions.delete(key);
            await sock.sendMessage(chatId, { text: `✅ تم إلغاء البث الجماعي.` }, { quoted: message });
            return true;
        }
        session.step      = 'waiting_confirm';
        session.text      = text.trim();
        session.timestamp = Date.now();
        broadcastSessions.set(key, session);
        await sock.sendMessage(chatId, {
            text:
                `📢 *تأكيد البث الجماعي*\n\n` +
                `الرسالة:\n${text.trim()}\n\n` +
                `📊 سيتم الإرسال لـ ${total} مشترك\n` +
                `⏱️ بفاصل ساعة بين كل رسالة\n\n` +
                `✅ أرسل "نعم" للتأكيد\n` +
                `❌ أرسل "لا" للإلغاء`
        }, { quoted: message });
        return true;
    }

    if (session.step === 'waiting_confirm') {
        if (CANCEL_WORDS.includes(lower)) {
            broadcastSessions.delete(key);
            await sock.sendMessage(chatId, { text: `✅ تم إلغاء البث الجماعي.` }, { quoted: message });
            return true;
        }
        if (CONFIRM_WORDS.includes(lower)) {
            broadcastSessions.delete(key);
            await performBroadcast(sock, chatId, message, senderId, session.text);
            return true;
        }
        await sock.sendMessage(chatId, {
            text: `⚠️ لم أفهم ردّك!\n✅ أرسل *"نعم"* للتأكيد\n❌ أرسل *"لا"* للإلغاء`
        }, { quoted: message });
        return true;
    }

    return false;
}

function isInBroadcastSession(chatId, senderId) {
    const s = broadcastSessions.get(chatId + senderId);
    if (!s) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        broadcastSessions.delete(chatId + senderId);
        return false;
    }
    return true;
}

module.exports = { broadcastCommand, handleBroadcastSession, isInBroadcastSession, performBroadcast };
