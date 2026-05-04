/**
 * results.js — نتيجة اللغة القبطية
 * الملف: natiga.xlsx
 */

const axios = require('axios');
const { lookupResult, resultsSize } = require('../lib/resultsDb');

const resultsSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;

const LEVEL_NAMES = { 1: 'الأول', 2: 'الثاني' };

function backHint() {
    return `\n━━━━━━━━━━━━━━━━━━\n📌 *للرجوع للقائمة السابقة:* اكتب 0\n🏠 *للرجوع للقائمة الرئيسية:* اكتب 00`;
}

async function resultsCommand(sock, chatId, message) {
    try {
        resultsSessions.set(chatId, { step: 'level', timestamp: Date.now() });
        const s1 = resultsSize(1);
        const s2 = resultsSize(2);
        await sock.sendMessage(chatId, {
            text:
                `🏆 *نتيجة اللغة القبطية*\n\n` +
                `📊 عدد الطلاب المسجلين:\n` +
                `• المستوى الأول: ${s1} طالب\n` +
                `• المستوى الثاني: ${s2} طالب\n\n` +
                `✏️ *اختر المستوى:*\n` +
                `1️⃣ المستوى الأول\n` +
                `2️⃣ المستوى الثاني\n\n` +
                backHint()
        }, { quoted: message });
    } catch (err) {
        console.error('❌ resultsCommand:', err);
    }
}

async function handleResultsSession(sock, chatId, message, text) {
    const session = resultsSessions.get(chatId);
    if (!session) return { handled: false };

    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        resultsSessions.delete(chatId);
        return { handled: false };
    }

    session.timestamp = Date.now();
    const trimmed = text.trim();
    const num = parseInt(trimmed);

    // معالجة الرجوع
    if (trimmed === '00') {
        resultsSessions.delete(chatId);
        return { handled: true, backToMain: true };
    }
    
    if (trimmed === '0') {
        if (session.step === 'code') {
            session.step = 'level';
            session.level = null;
            const s1 = resultsSize(1);
            const s2 = resultsSize(2);
            await sock.sendMessage(chatId, {
                text:
                    `🏆 *نتيجة اللغة القبطية*\n\n` +
                    `📊 عدد الطلاب المسجلين:\n` +
                    `• المستوى الأول: ${s1} طالب\n` +
                    `• المستوى الثاني: ${s2} طالب\n\n` +
                    `✏️ *اختر المستوى:*\n` +
                    `1️⃣ المستوى الأول\n` +
                    `2️⃣ المستوى الثاني\n\n` +
                    backHint()
            }, { quoted: message });
            return { handled: true };
        }
        resultsSessions.delete(chatId);
        return { handled: true, backToMain: true };
    }

    if (session.step === 'level') {
        if (num === 1 || num === 2) {
            session.step = 'code';
            session.level = num;
            await sock.sendMessage(chatId, {
                text:
                    `🏆 *نتيجة المستوى ${LEVEL_NAMES[num]}*\n\n` +
                    `📝 أدخل الرقم الكودي الخاص بك:\n` +
                    `(مثال: 12345)\n\n` +
                    backHint()
            }, { quoted: message });
            return { handled: true };
        }
        await sock.sendMessage(chatId, {
            text: `⚠️ *خطأ في الإدخال*\n\nيرجى إدخال:\n• 1 للمستوى الأول\n• 2 للمستوى الثاني\n\n` + backHint()
        }, { quoted: message });
        return { handled: true };
    }

    if (session.step === 'code') {
        const level = session.level;
        const certUrl = lookupResult(level, trimmed);

        resultsSessions.delete(chatId);

        if (!certUrl) {
            await sock.sendMessage(chatId, {
                text:
                    `❌ *الرقم الكودي غير موجود*\n\n` +
                    `🔢 الرقم المُدخَل: ${trimmed}\n` +
                    `📌 المستوى: ${LEVEL_NAMES[level]}\n\n` +
                    `🔍 تأكد من الرقم وحاول مجدداً\n` +
                    `📞 أو تواصل مع مسؤول الدورة 👑\n\n` +
                    `✨ لإعادة المحاولة اكتب *نتيجة* مرة أخرى`
            }, { quoted: message });
            return { handled: true };
        }

        // إظهار تفاعل التحميل
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            const response = await axios.get(certUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxRedirects: 10,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const imgBuffer = Buffer.from(response.data, 'binary');
            
            // التحقق من صحة الصورة
            if (imgBuffer.length < 500) {
                throw new Error('الملف فارغ أو غير صالح');
            }

            // إظهار تفاعل النجاح
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
            
            // إرسال الشهادة
            await sock.sendMessage(chatId, {
                image: imgBuffer,
                caption:
                    `🎓 *شهادة اللغة القبطية*\n\n` +
                    `📋 المستوى: ${LEVEL_NAMES[level]}\n` +
                    `🔢 الرقم الكودي: ${trimmed}\n\n` +
                    `👨‍🏫 مسؤول الدورة: إبرام مرزق\n` +
                    `🎉 ألف مبروك النجاح!`
            }, { quoted: message });

        } catch (err) {
            console.error('❌ خطأ في إرسال الشهادة:', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, {
                text: 
                    `❌ *تعذّر تحميل الشهادة*\n\n` +
                    `⚠️ حدث خطأ أثناء تحميل الشهادة\n\n` +
                    `🔧 يرجى المحاولة لاحقاً\n` +
                    `📞 أو التواصل مع مسؤول الدورة 👑\n\n` +
                    `🔗 رابط الشهادة (إذا كنت بحاجة):\n${certUrl}`
            }, { quoted: message });
        }

        return { handled: true };
    }

    return { handled: false };
}

function getResultsBackTarget(chatId) {
    const s = resultsSessions.get(chatId);
    if (!s) return 'main';
    if (s.step === 'code') return 'level';
    return 'main';
}

function isInResultsSession(chatId) {
    const s = resultsSessions.get(chatId);
    if (!s) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        resultsSessions.delete(chatId);
        return false;
    }
    return true;
}

function clearResultsSession(chatId) {
    resultsSessions.delete(chatId);
}

module.exports = {
    resultsCommand, 
    handleResultsSession,
    isInResultsSession, 
    clearResultsSession, 
    getResultsBackTarget
};