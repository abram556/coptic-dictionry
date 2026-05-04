/**
 * learn.js — تعلم اللغة القبطية
 * يقرأ الدروس من learn.xlsx ديناميكياً
 */

const axios = require('axios');
const { getLessons, learnDbSize } = require('../lib/learnDb');

const learnSessions  = new Map();
const SESSION_TIMEOUT = 10 * 60 * 1000;

const LEVEL_NAMES = { 1: 'الأول', 2: 'الثاني' };

function backHint() {
    return `\nللرجوع للقائمة السابقة اكتب 0\nللرجوع للقائمة الرئيسية اكتب 00`;
}

async function learnCommand(sock, chatId, message) {
    try {
        learnSessions.set(chatId, { step: 'level', timestamp: Date.now() });
        const l1 = learnDbSize(1);
        const l2 = learnDbSize(2);
        await sock.sendMessage(chatId, {
            text:
                `📚 *تعلم اللغة القبطية*\n\n` +
                `للمستوى الأول (${l1} درس) اكتب 1\n` +
                `للمستوى الثاني (${l2} درس) اكتب 2\n` +
                backHint()
        }, { quoted: message });
    } catch (err) {
        console.error('❌ learnCommand:', err);
    }
}

async function showLessons(sock, chatId, message, level) {
    const lessons  = getLessons(level);
    const levelTxt = LEVEL_NAMES[level];

    learnSessions.set(chatId, { step: `lessons_${level}`, level, timestamp: Date.now() });

    if (lessons.length === 0) {
        await sock.sendMessage(chatId, {
            text: `⚠️ لا توجد دروس في المستوى ${levelTxt} بعد.\nتواصل مع المالك 👑\n` + backHint()
        }, { quoted: message });
        return;
    }

    let text = `📚 *المستوى ${levelTxt}*\n\n`;
    for (let i = 0; i < lessons.length; i++) {
        text += `${i + 1}. ${lessons[i].name}\n`;
    }
    text += backHint();

    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function sendLesson(sock, chatId, message, level, lessonNum) {
    const lessons  = getLessons(level);
    const levelTxt = LEVEL_NAMES[level];

    if (lessonNum < 1 || lessonNum > lessons.length) return false;

    const lesson   = lessons[lessonNum - 1];
    const videoUrl = lesson.videoUrl;

    if (!videoUrl) {
        await sock.sendMessage(chatId, {
            text:
                `⚠️ *${lesson.name}*\n\n` +
                `رابط هذا الدرس لم يُضَف بعد.\n` +
                `تواصل مع المالك 👑\n` +
                backHint()
        }, { quoted: message });
        return true;
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
        const response = await axios.get(videoUrl, {
            responseType : 'arraybuffer',
            timeout      : 90000,
            maxRedirects : 5,
            headers      : { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const videoBuffer = Buffer.from(response.data, 'binary');
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
            video   : videoBuffer,
            mimetype: 'video/mp4',
            caption :
                `🎬 *${lesson.name}*\n` +
                `المستوى ${levelTxt} — اللغة القبطية 📖\n` +
                backHint()
        }, { quoted: message });

    } catch (err) {
        console.error(`❌ خطأ في إرسال الدرس:`, err.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text:
                `❌ *تعذّر تحميل: ${lesson.name}*\n\n` +
                `يرجى المحاولة لاحقاً أو التواصل مع المالك 👑\n` +
                backHint()
        }, { quoted: message });
    }

    return true;
}

async function handleLearnSession(sock, chatId, message, text) {
    const session = learnSessions.get(chatId);
    if (!session) return { handled: false };

    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        learnSessions.delete(chatId);
        return { handled: false };
    }

    session.timestamp = Date.now();
    const num = parseInt(text.trim());

    if (session.step === 'level') {
        if (num === 1 || num === 2) {
            await showLessons(sock, chatId, message, num);
            return { handled: true };
        }
        await sock.sendMessage(chatId, {
            text: `⚠️ اكتب *1* للمستوى الأول أو *2* للمستوى الثاني.\n` + backHint()
        });
        return { handled: true };
    }

    if (session.step === 'lessons_1' || session.step === 'lessons_2') {
        const level = session.step === 'lessons_1' ? 1 : 2;
        const count = learnDbSize(level);
        if (num >= 1 && num <= count) {
            await sendLesson(sock, chatId, message, level, num);
            return { handled: true };
        }
        if (count === 0) {
            await sock.sendMessage(chatId, { text: `⚠️ لا توجد دروس بعد.\n` + backHint() });
        } else {
            await sock.sendMessage(chatId, {
                text: `⚠️ اكتب رقماً من 1 إلى ${count}.\n` + backHint()
            });
        }
        return { handled: true };
    }

    return { handled: false };
}

function getLearnBackTarget(chatId) {
    const s = learnSessions.get(chatId);
    if (!s) return 'main';
    if (s.step === 'lessons_1' || s.step === 'lessons_2') return 'level';
    return 'main';
}

function isInLearnSession(chatId) {
    const s = learnSessions.get(chatId);
    if (!s) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        learnSessions.delete(chatId);
        return false;
    }
    return true;
}

function clearLearnSession(chatId) {
    learnSessions.delete(chatId);
}

module.exports = { learnCommand, handleLearnSession, isInLearnSession, clearLearnSession, getLearnBackTarget };
