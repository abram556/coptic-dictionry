/**
 * coptoc.js — القاموس القبطي-العربي الناطق v8.1
 * ─────────────────────────────────────────────────────────────
 * البحث يعمل بالعربي أو القبطي
 * النتيجة تُظهر: الكلمة، المعنى، النوع، الأصل، الملف الصوتي
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const { lookupCoptocWord, formatLookupResult, formatResultForDisplay } = require('../lib/coptocDb');

const dictSessions    = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;

function backHint() {
    return `\nللرجوع للقائمة الرئيسية اكتب 00`;
}

// ── إرسال الملف الصوتي مع ضمان الرابط المباشر ───────────────
async function sendAudio(sock, chatId, message, audioUrl) {
    if (!audioUrl) return;
    try {
        const response = await axios.get(audioUrl, {
            responseType : 'arraybuffer',
            timeout      : 45000,
            maxRedirects : 10,
            headers      : {
                'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept'         : 'audio/*,*/*',
                'Accept-Language': 'ar,en;q=0.9'
            }
        });
        const buf = Buffer.from(response.data, 'binary');
        if (buf.length < 500) throw new Error('الملف الصوتي فارغ أو غير صالح');

        await sock.sendMessage(chatId, {
            audio    : buf,
            mimetype : 'audio/mpeg',
            ptt      : false
        }, { quoted: message });
    } catch (err) {
        console.error('❌ خطأ في تحميل الصوت:', err.message);
        await sock.sendMessage(chatId, {
            text: `🔇 *تعذّر تشغيل الصوت*\nيرجى المحاولة لاحقاً أو التواصل مع المسؤول.`
        }, { quoted: message }).catch(() => {});
    }
}

// ── تنسيق النتيجة للمستخدم (معدل لإظهار النوع والأصل) ──────────────────────────────────
function formatResult(searchedWord, lookupResult) {
    const { type, result } = lookupResult;
    const formatted = formatLookupResult(lookupResult);
    if (!formatted) return null;

    if (type === 'coptic') {
        // البحث بالكلمة القبطية
        const copticWordsDisplay = formatted.copticWords?.join('، ') || searchedWord;
        const arabicMeanings = formatted.arabicMeanings?.join('، ') || '—';
        const wordType = formatted.wordType || '—';
        const wordOrigin = formatted.wordOrigin || '—';
        
        let responseText = `الكلمة: ${copticWordsDisplay}\n`;
        responseText += `المعنى العربي: ${arabicMeanings}\n`;
        if (wordType && wordType !== '—') {
            responseText += `النوع: ${wordType}\n`;
        }
        if (wordOrigin && wordOrigin !== '—') {
            responseText += `الأصل: ${wordOrigin}`;
        }
        return responseText;
    } else {
        // البحث بالكلمة العربية
        const arabicWordDisplay = formatted.arabicWord || searchedWord;
        const copticWords = formatted.copticWords?.join('، ') || '—';
        const wordType = formatted.wordType || '—';
        const wordOrigin = formatted.wordOrigin || '—';
        
        let responseText = `الكلمة: ${arabicWordDisplay}\n`;
        responseText += `المعنى القبطي: ${copticWords}\n`;
        if (wordType && wordType !== '—') {
            responseText += `النوع: ${wordType}\n`;
        }
        if (wordOrigin && wordOrigin !== '—') {
            responseText += `الأصل: ${wordOrigin}`;
        }
        return responseText;
    }
}

// ── تنفيذ البحث الفعلي ────────────────────────────────────────
async function performCoptocLookup(sock, chatId, message, word) {
    const found = lookupCoptocWord(word);

    if (!found) {
        await sock.sendMessage(chatId, {
            text:
                `القاموس قيد التطوير حاليا وسيتم اضافة معنى هذه الكلمة لاحقا\n\n` +
                backHint()
        }, { quoted: message });
        dictSessions.set(chatId, { waiting: true, timestamp: Date.now() });
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

    const responseText = formatResult(word, found);
    if (responseText) {
        await sock.sendMessage(chatId, { text: responseText }, { quoted: message });
    }

    // إرسال الصوت إذا كان موجوداً
    if (found.result.audioUrl) {
        await sendAudio(sock, chatId, message, found.result.audioUrl);
    }

    await sock.sendMessage(chatId, {
        text: `✨ تفضل بكتابة كلمة أخرى للبحث في القاموس 🔍\n` + backHint()
    });

    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    dictSessions.set(chatId, { waiting: true, timestamp: Date.now() });
}

// ── الأمر الرئيسي للقاموس ────────────────────────────────────
async function coptocCommand(sock, chatId, message) {
    try {
        dictSessions.set(chatId, { waiting: true, timestamp: Date.now() });
        await sock.sendMessage(chatId, {
            text:
                `📖 *القاموس القبطي*\n\n` +
                `تفضل بكتابة الكلمة القبطية أو العربية التي تريد البحث عنها 🔍\n` +
                backHint()
        });
    } catch (err) {
        console.error('❌ coptocCommand:', err);
    }
}

// ── معالجة رد المستخدم ───────────────────────────────────────
async function handleCoptocReply(sock, chatId, message, userMessage) {
    const session = dictSessions.get(chatId);
    if (!session?.waiting) return false;

    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        dictSessions.delete(chatId);
        return false;
    }

    const word = userMessage.trim();
    if (!word) return false;

    await performCoptocLookup(sock, chatId, message, word);
    return true;
}

function isWaitingForCoptoc(chatId) {
    const s = dictSessions.get(chatId);
    if (!s) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        dictSessions.delete(chatId);
        return false;
    }
    return s.waiting === true;
}

function endCoptocSession(chatId) {
    dictSessions.delete(chatId);
}

module.exports = {
    coptocCommand,
    handleCoptocReply,
    isWaitingForCoptoc,
    endCoptocSession
};