/**
 * uploadLearn.js — رفع ملف learn.xlsx لقاعدة دروس التعلم
 * للأدمن فقط
 */

const fs   = require('fs');
const path = require('path');
const { reloadLearnDb, learnDbSize } = require('../lib/learnDb');
const { downloadMediaMessage }       = require('@whiskeysockets/baileys');
const { isAdmin }                    = require('../lib/adminAuth');

const uploadSessions  = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LEARN_PATH      = path.join(__dirname, '../data/learn.xlsx');

async function uploadLearnCommand(sock, chatId, message, senderId) {
    try {
        uploadSessions.set(chatId, { senderId, timestamp: Date.now() });
        await sock.sendMessage(chatId, {
            text:
                `📂 *رفع ملف دروس التعلم*\n\n` +
                `أرسل ملف *learn.xlsx* الآن\n\n` +
                `📋 شروط الملف:\n` +
                `  • اسم الملف: learn.xlsx\n` +
                `  • الورقة الأولى: level1 (المستوى الأول)\n` +
                `  • الورقة الثانية: level2 (المستوى الثاني)\n` +
                `  • العمود A: اسم الدرس\n` +
                `  • العمود B: رابط Google Drive للفيديو\n\n` +
                `📊 الدروس الحالية: المستوى1: ${learnDbSize(1)} | المستوى2: ${learnDbSize(2)}\n` +
                `⏳ المهلة: 5 دقائق`
        }, { quoted: message });
    } catch (err) {
        console.error('❌ uploadLearnCommand:', err);
    }
}

async function processLearnXlsx(sock, chatId, message, senderId) {
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;

    const fileName = docMsg.fileName || '';
    const mimeType = docMsg.mimetype || '';
    const isXlsx   =
        fileName.toLowerCase().endsWith('.xlsx') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('excel') ||
        mimeType.includes('openxmlformats');

    if (!isXlsx) return false;

    try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        const buffer = await downloadMediaMessage(
            message, 'buffer', {},
            { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer || buffer.length === 0) throw new Error('الملف فارغ');

        if (fs.existsSync(LEARN_PATH)) {
            fs.copyFileSync(LEARN_PATH, LEARN_PATH.replace('.xlsx', `_backup_${Date.now()}.xlsx`));
        }
        fs.writeFileSync(LEARN_PATH, buffer);

        const ok = reloadLearnDb();
        if (!ok) throw new Error('فشل في تحليل الملف — تأكد من وجود الورقتين level1 و level2');

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
            text:
                `✅ *تم رفع ملف الدروس بنجاح!*\n\n` +
                `📚 المستوى الأول: *${learnDbSize(1)} درس*\n` +
                `📚 المستوى الثاني: *${learnDbSize(2)} درس*\n` +
                `🕐 ${new Date().toLocaleString('ar-EG')}`
        }, { quoted: message });

    } catch (err) {
        console.error('❌ processLearnXlsx:', err);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ في رفع ملف الدروس*\n\n${err.message}`
        }, { quoted: message });
    }
    return true;
}

async function handleLearnUploadReply(sock, chatId, message, senderId) {
    const session = uploadSessions.get(chatId);
    if (!session || session.senderId !== senderId || !isAdmin(senderId)) return false;
    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    uploadSessions.delete(chatId);
    return await processLearnXlsx(sock, chatId, message, senderId);
}

async function handleDirectLearnUpload(sock, chatId, message, senderId) {
    if (!isAdmin(senderId)) return false;
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    const fileName = (docMsg.fileName || '').toLowerCase();
    if (!fileName.includes('learn')) return false;
    const handled = await processLearnXlsx(sock, chatId, message, senderId);
    if (handled) uploadSessions.delete(chatId);
    return handled;
}

function isWaitingForLearnUpload(chatId, senderId) {
    const s = uploadSessions.get(chatId);
    if (!s || s.senderId !== senderId) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    return true;
}

module.exports = { uploadLearnCommand, handleLearnUploadReply, isWaitingForLearnUpload, handleDirectLearnUpload };
