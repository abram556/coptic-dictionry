/**
 * main.js — مركز اللغة القبطية v8
 * تمت الإضافة: حذف متعدد، تعديل، تنزيل انتقائي، رفع مشتركين، إحصائيات
 */

const settings = require('./settings');
require('./config.js');

const { isBanned } = require('./lib/isBanned');
const { isAdmin, grantAdmin, revokeAdmin, isValidAdminCommand } = require('./lib/adminAuth');
const { sendButtons, sendListMessage } = require('./lib/buttons');
const { registerSubscriber, registerUsage, subscribersCount, exportSubscribersXlsx, importSubscribersFromXlsx, getAllSubscribers, getUserStats } = require('./lib/subscribersDb');

const { 
    coptocSize, 
    addWordFormatted, 
    addMultipleWordsFormatted,
    deleteWordByCopticFull,
    deleteMultipleWordsByCoptic,
    updateWord,
    exportCoptocXlsx, 
    reloadCoptocDb,
    getAllEntries,
    findEntryByCoptic,
    formatCellContent
} = require('./lib/coptocDb');

const { 
    resultsSize, 
    addResult, 
    deleteResult,
    deleteMultipleResults,
    updateResult,
    exportResultsXlsx, 
    reloadResultsDb,
    getAllResults,
    getResultEntry
} = require('./lib/resultsDb');

const { 
    learnDbSize, 
    addLesson, 
    deleteLesson,
    deleteMultipleLessons,
    updateLesson,
    exportLearnXlsx, 
    reloadLearnDb, 
    getLessons,
    getAllLessons
} = require('./lib/learnDb');

const ownerCommand = require('./commands/owner');

const { learnCommand, handleLearnSession, isInLearnSession, clearLearnSession, getLearnBackTarget } = require('./commands/learn');
const { coptocCommand, handleCoptocReply, isWaitingForCoptoc, endCoptocSession } = require('./commands/coptoc');
const { resultsCommand, handleResultsSession, isInResultsSession, clearResultsSession, getResultsBackTarget } = require('./commands/results');
const { broadcastCommand, handleBroadcastSession, isInBroadcastSession } = require('./commands/broadcast');

const { uploadCoptocCommand, handleCoptocUploadReply, isWaitingForCoptocUpload, handleDirectCoptocUpload } = require('./commands/uploadCoptoc');
const { uploadLearnCommand, handleLearnUploadReply, isWaitingForLearnUpload, handleDirectLearnUpload } = require('./commands/uploadLearn');
const { uploadResultsCommand, handleResultsUploadReply, isWaitingForResultsUpload, handleDirectResultsUpload } = require('./commands/uploadResults');
const { uploadSubscribersCommand, handleSubscribersUploadReply, isWaitingForSubscribersUpload, handleDirectSubscribersUpload } = require('./commands/uploadSubscribers');

// ══════════════════════════════════════════════════════════════
// مدير الجلسات
// ══════════════════════════════════════════════════════════════
const userActiveMode = new Map();

function setActiveMode(chatId, mode) { userActiveMode.set(chatId, mode); }
function getActiveMode(chatId) { return userActiveMode.get(chatId) || null; }

function clearAllSessions(chatId) {
    userActiveMode.delete(chatId);
    clearLearnSession(chatId);
    endCoptocSession(chatId);
    clearResultsSession(chatId);
}

// ══════════════════════════════════════════════════════════════
// تحويل الأرقام العربية إلى إنجليزية
// ══════════════════════════════════════════════════════════════
function normalizeArabicNumerals(text) {
    const ar = '٠١٢٣٤٥٦٧٨٩';
    return text.replace(/[٠-٩]/g, d => ar.indexOf(d).toString());
}

function parseMenuChoice(text) {
    const t = text.trim().toLowerCase();
    if (t === '1' || t === 'واحد' || t === 'واحده') return 1;
    if (t === '2' || t === 'اثنين' || t === 'اتنين' || t === 'اثنان') return 2;
    if (t === '3' || t === 'ثلاثة' || t === 'ثلاثه' || t === 'تلاتة' || t === 'تلاثة') return 3;
    return null;
}

function isBackCommand(text) {
    const t = text.trim().toLowerCase();
    return t === 'رجوع' || t === 'رجع' || t === 'back' || t === '0' || t === 'خروج';
}

function isMainMenuCommand(text) {
    const t = text.trim();
    return t === '00' || t === 'قائمة' || t === 'البداية' || t === 'رئيسية';
}

// ══════════════════════════════════════════════════════════════
// القائمة الرئيسية
// ══════════════════════════════════════════════════════════════
async function showMainMenu(sock, chatId, message) {
    clearAllSessions(chatId);
    const name = message?.pushName ? `👋 أهلاً ${message.pushName}!\n\n` : '👋 أهلاً!\n\n';
    await sock.sendMessage(chatId, {
        text:
            `${name}` +
            `لتعلم اللغة القبطية اكتب 1\n` +
            `لقاموس اللغة القبطية اكتب 2\n` +
            `لنتيجة اللغة القبطية اكتب 3`
    });
}

async function enterLearnMode(sock, chatId, message, senderId) {
    clearAllSessions(chatId);
    setActiveMode(chatId, 'learn');
    registerUsage(senderId, 'learn');
    await learnCommand(sock, chatId, message);
}

async function enterDictMode(sock, chatId, message, senderId) {
    clearAllSessions(chatId);
    setActiveMode(chatId, 'dict');
    registerUsage(senderId, 'dict');
    await coptocCommand(sock, chatId, message);
}

async function enterResultsMode(sock, chatId, message, senderId) {
    clearAllSessions(chatId);
    setActiveMode(chatId, 'results');
    registerUsage(senderId, 'results');
    await resultsCommand(sock, chatId, message);
}

async function handleBack(sock, chatId, message) {
    const mode = getActiveMode(chatId);
    if (mode === 'learn') {
        const target = getLearnBackTarget(chatId);
        if (target === 'level') {
            clearLearnSession(chatId);
            setActiveMode(chatId, 'learn');
            await learnCommand(sock, chatId, message);
        } else {
            await showMainMenu(sock, chatId, message);
        }
        return;
    }
    if (mode === 'results') {
        const target = getResultsBackTarget(chatId);
        if (target === 'level') {
            clearResultsSession(chatId);
            setActiveMode(chatId, 'results');
            await resultsCommand(sock, chatId, message);
        } else {
            await showMainMenu(sock, chatId, message);
        }
        return;
    }
    if (mode === 'dict') {
        await showMainMenu(sock, chatId, message);
        return;
    }
    await showMainMenu(sock, chatId, message);
}

// ══════════════════════════════════════════════════════════════
// جلسات الإضافة اليدوية للأدمن
// ══════════════════════════════════════════════════════════════
const adminSessions = new Map();
const ADMIN_SESSION_TIMEOUT = 10 * 60 * 1000;

function setAdminSession(key, data) {
    adminSessions.set(key, { ...data, timestamp: Date.now() });
}

function getAdminSession(key) {
    const s = adminSessions.get(key);
    if (!s) return null;
    if (Date.now() - s.timestamp > ADMIN_SESSION_TIMEOUT) {
        adminSessions.delete(key);
        return null;
    }
    return s;
}

function clearAdminSession(key) {
    adminSessions.delete(key);
}

// ══════════════════════════════════════════════════════════════
// إحصائيات الأدمن
// ══════════════════════════════════════════════════════════════
async function sendStats(sock, chatId, message) {
    await sock.sendMessage(chatId, { react: { text: '📊', key: message.key } });
    await sock.sendMessage(chatId, {
        text:
            `📊 *إحصائيات مركز اللغة القبطية*\n\n` +
            `📚 دروس المستوى الأول: *${learnDbSize(1)}*\n` +
            `📚 دروس المستوى الثاني: *${learnDbSize(2)}*\n\n` +
            `📖 القاموس القبطي: *${coptocSize()} كلمة*\n\n` +
            `🏆 نتائج المستوى الأول: *${resultsSize(1)} طالب*\n` +
            `🏆 نتائج المستوى الثاني: *${resultsSize(2)} طالب*\n\n` +
            `👥 المشتركون: *${subscribersCount()}*\n\n` +
            `🕐 ${new Date().toLocaleString('ar-EG')}`
    }, { quoted: message });
}

// ══════════════════════════════════════════════════════════════
// تنزيل الشيتات بشكل انتقائي
// ══════════════════════════════════════════════════════════════
async function sendSelectiveDownloads(sock, chatId, message) {
    await sock.sendMessage(chatId, {
        text:
            `📥 *تنزيل البيانات*\n\n` +
            `اختر ما تريد تنزيله:\n\n` +
            `/downloadlearn - تنزيل ملف التعلم\n` +
            `/downloadcoptic - تنزيل ملف القاموس\n` +
            `/downloadresults - تنزيل ملف النتائج\n` +
            `/downloadsubs - تنزيل ملف المشتركين\n` +
            `/downloadall - تنزيل جميع الملفات`
    }, { quoted: message });
}

async function sendLearnDownload(sock, chatId, message) {
    const learnBuf = exportLearnXlsx();
    if (learnBuf) {
        await sock.sendMessage(chatId, {
            document: learnBuf,
            fileName: `learn_${Date.now()}.xlsx`,
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            caption: `📚 دروس التعلم — المستوى1: ${learnDbSize(1)} | المستوى2: ${learnDbSize(2)}`
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: `❌ فشل تصدير ملف التعلم` }, { quoted: message });
    }
}

async function sendCopticDownload(sock, chatId, message) {
    const coptocBuf = exportCoptocXlsx();
    if (coptocBuf) {
        await sock.sendMessage(chatId, {
            document: coptocBuf,
            fileName: `coptic_${Date.now()}.xlsx`,
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            caption: `📖 القاموس القبطي — ${coptocSize()} كلمة`
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: `❌ فشل تصدير ملف القاموس` }, { quoted: message });
    }
}

async function sendResultsDownload(sock, chatId, message) {
    const natigaBuf = exportResultsXlsx();
    if (natigaBuf) {
        await sock.sendMessage(chatId, {
            document: natigaBuf,
            fileName: `natiga_${Date.now()}.xlsx`,
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            caption: `🏆 النتائج — الأول: ${resultsSize(1)} | الثاني: ${resultsSize(2)}`
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: `❌ فشل تصدير ملف النتائج` }, { quoted: message });
    }
}

async function sendSubscribersDownload(sock, chatId, message) {
    const subBuf = exportSubscribersXlsx();
    if (subBuf) {
        await sock.sendMessage(chatId, {
            document: subBuf,
            fileName: `subscribers_${Date.now()}.xlsx`,
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            caption: `👥 المشتركون — ${subscribersCount()} مشترك`
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: `❌ فشل تصدير ملف المشتركين` }, { quoted: message });
    }
}

async function sendAllDownloads(sock, chatId, message) {
    await sendLearnDownload(sock, chatId, message);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await sendCopticDownload(sock, chatId, message);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await sendResultsDownload(sock, chatId, message);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await sendSubscribersDownload(sock, chatId, message);
}

// ══════════════════════════════════════════════════════════════
// دوال معالجة جلسات الأدمن الجديدة
// ══════════════════════════════════════════════════════════════
async function handleAdminSession(sock, chatId, message, senderId, trimmed) {
    const key = chatId + senderId;
    const session = getAdminSession(key);
    if (!session) return false;

    setAdminSession(key, { ...session, timestamp: Date.now() });

    // ── addword_formatted (إضافة بالشكل المطلوب) ──
    if (session.type === 'addword_formatted') {
        if (session.step === 'cell') {
            session.cellContent = trimmed;
            session.step = 'audio';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `الخطوة 2/2 — أرسل رابط الصوت (Google Drive):\n(أو أرسل "-" إذا لا يوجد صوت)`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'audio') {
            const audioUrl = (trimmed === '-') ? null : trimmed;
            clearAdminSession(key);
            const ok = addWordFormatted(session.cellContent, audioUrl);
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تمت الإضافة للقاموس!*\n\n${session.cellContent}\n📊 إجمالي القاموس: ${coptocSize()} كلمة`
                    : `❌ فشل حفظ الكلمة. تأكد من الصيغة: (الكلمات العربية). (الكلمة القبطية). (الأصل). (النوع).mp3`
            }, { quoted: message });
            return true;
        }
    }

    // ── deleteword_coptic (حذف بالكلمة القبطية) ──
    if (session.type === 'deleteword_coptic') {
        const ok = deleteWordByCopticFull(trimmed);
        clearAdminSession(key);
        await sock.sendMessage(chatId, {
            text: ok
                ? `✅ *تم حذف الكلمة بنجاح!*\n\n📊 إجمالي القاموس بعد الحذف: ${coptocSize()} كلمة`
                : `❌ لم يتم العثور على كلمة "${trimmed}" في القاموس.`
        }, { quoted: message });
        return true;
    }

    // ── deleteword_multiple (حذف متعدد) ──
    if (session.type === 'deleteword_multiple') {
        const words = trimmed.split(/[،,]+/).map(w => w.trim()).filter(Boolean);
        const result = deleteMultipleWordsByCoptic(words);
        clearAdminSession(key);
        await sock.sendMessage(chatId, {
            text:
                `🗑️ *حذف متعدد من القاموس*\n\n` +
                `✅ تم الحذف: *${result.deleted}*\n` +
                `❌ لم يتم العثور: *${result.notFound}*\n` +
                `${result.notFoundWords.length > 0 ? `\nغير موجود: ${result.notFoundWords.join(', ')}` : ''}\n\n` +
                `📊 إجمالي القاموس بعد الحذف: ${coptocSize()} كلمة`
        }, { quoted: message });
        return true;
    }

    // ── updateword (تعديل كلمة) ──
    if (session.type === 'updateword') {
        if (session.step === 'find') {
            const entry = findEntryByCoptic(trimmed);
            if (!entry) {
                clearAdminSession(key);
                await sock.sendMessage(chatId, {
                    text: `❌ لم يتم العثور على كلمة "${trimmed}" في القاموس.`
                }, { quoted: message });
                return true;
            }
            session.oldCoptic = trimmed;
            session.oldEntry = entry;
            session.step = 'new_cell';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text:
                    `✏️ *تعديل كلمة في القاموس*\n\n` +
                    `المدخل الحالي:\n${entry.originalCell}\n\n` +
                    `أرسل المحتوى الجديد بالصيغة:\n` +
                    `(الكلمات العربية). (الكلمة القبطية). (الأصل). (النوع).mp3`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_cell') {
            session.newCell = trimmed;
            session.step = 'new_audio';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `أرسل رابط الصوت الجديد (أو "-" للإبقاء على الرابط الحالي):`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_audio') {
            const newAudio = (trimmed === '-') ? session.oldEntry.audioUrl : trimmed;
            const ok = updateWord(session.oldCoptic, session.newCell, newAudio);
            clearAdminSession(key);
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تم تعديل الكلمة بنجاح!*\n\n${session.newCell}`
                    : `❌ فشل تعديل الكلمة. تأكد من الصيغة الصحيحة.`
            }, { quoted: message });
            return true;
        }
    }

    // ── addlesson_formatted ──────────────────────────────
    if (session.type === 'addlesson_formatted') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'name';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, { text: `الخطوة 2/3 — أرسل اسم الدرس:` }, { quoted: message });
            return true;
        }
        if (session.step === 'name') {
            session.lessonName = trimmed;
            session.step = 'url';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, { text: `الخطوة 3/3 — أرسل رابط فيديو الدرس (Google Drive):` }, { quoted: message });
            return true;
        }
        if (session.step === 'url') {
            if (!/^https?:\/\//.test(trimmed) && trimmed !== '-') {
                await sock.sendMessage(chatId, { text: `❌ الرابط غير صحيح. أرسل رابطاً يبدأ بـ https://` }, { quoted: message });
                return true;
            }
            const videoUrl = (trimmed === '-') ? null : trimmed;
            clearAdminSession(key);
            const ok = addLesson(session.level, session.lessonName, videoUrl);
            const lName = session.level === 1 ? 'الأول' : 'الثاني';
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تمت إضافة الدرس!*\n\nالمستوى: ${lName}\nالدرس: ${session.lessonName}\n📚 إجمالي دروس المستوى: ${learnDbSize(session.level)}`
                    : `❌ فشل حفظ الدرس. حاول مجدداً.`
            }, { quoted: message });
            return true;
        }
    }

    // ── deletelesson_multiple (حذف متعدد للدروس) ──
    if (session.type === 'deletelesson_multiple') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'names';
            setAdminSession(key, session);
            
            const lessons = getLessons(n);
            let lessonList = `📚 *دروس المستوى ${n === 1 ? 'الأول' : 'الثاني'}*:\n\n`;
            lessons.forEach((l, i) => {
                lessonList += `${i+1}. ${l.name}\n`;
            });
            lessonList += `\nأرسل أسماء الدروس للحذف مفصولة بفواصل:`;
            
            await sock.sendMessage(chatId, { text: lessonList }, { quoted: message });
            return true;
        }
        if (session.step === 'names') {
            const names = trimmed.split(/[،,]+/).map(n => n.trim()).filter(Boolean);
            const result = deleteMultipleLessons(session.level, names);
            clearAdminSession(key);
            const lName = session.level === 1 ? 'الأول' : 'الثاني';
            await sock.sendMessage(chatId, {
                text:
                    `🗑️ *حذف متعدد من الدروس*\n\n` +
                    `✅ تم الحذف: *${result.deleted}*\n` +
                    `❌ لم يتم العثور: *${result.notFound}*\n` +
                    `${result.notFoundNames.length > 0 ? `\nغير موجود: ${result.notFoundNames.join(', ')}` : ''}\n\n` +
                    `📚 إجمالي دروس المستوى ${lName}: ${learnDbSize(session.level)}`
            }, { quoted: message });
            return true;
        }
    }

    // ── updatelesson (تعديل درس) ──
    if (session.type === 'updatelesson') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'find';
            setAdminSession(key, session);
            
            const lessons = getLessons(n);
            let lessonList = `📚 *دروس المستوى ${n === 1 ? 'الأول' : 'الثاني'}*:\n\n`;
            lessons.forEach((l, i) => {
                lessonList += `${i+1}. ${l.name}\n`;
            });
            lessonList += `\nأرسل اسم الدرس الذي تريد تعديله:`;
            
            await sock.sendMessage(chatId, { text: lessonList }, { quoted: message });
            return true;
        }
        if (session.step === 'find') {
            const lessons = getLessons(session.level);
            const found = lessons.find(l => l.name === trimmed);
            if (!found) {
                clearAdminSession(key);
                await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على درس "${trimmed}"` }, { quoted: message });
                return true;
            }
            session.oldName = trimmed;
            session.step = 'new_name';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `✏️ *تعديل درس*\n\nالدرس الحالي: ${trimmed}\nأرسل الاسم الجديد للدرس (أو "-" للإبقاء):`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_name') {
            session.newName = (trimmed === '-') ? session.oldName : trimmed;
            session.step = 'new_url';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `أرسل رابط الفيديو الجديد (أو "-" للإبقاء على الرابط الحالي):`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_url') {
            const newUrl = (trimmed === '-') ? null : trimmed;
            const ok = updateLesson(session.level, session.oldName, session.newName, newUrl);
            clearAdminSession(key);
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تم تعديل الدرس بنجاح!*\n\n${session.newName}`
                    : `❌ فشل تعديل الدرس.`
            }, { quoted: message });
            return true;
        }
    }

    // ── addresult_formatted ──────────────────────────────
    if (session.type === 'addresult_formatted') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'code';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, { text: `الخطوة 2/3 — أرسل الرقم الكودي للطالب:` }, { quoted: message });
            return true;
        }
        if (session.step === 'code') {
            session.code = trimmed;
            session.step = 'url';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, { text: `الخطوة 3/3 — أرسل رابط الشهادة:` }, { quoted: message });
            return true;
        }
        if (session.step === 'url') {
            if (!/^https?:\/\//.test(trimmed)) {
                await sock.sendMessage(chatId, { text: `❌ الرابط غير صحيح. أرسل رابطاً يبدأ بـ https://` }, { quoted: message });
                return true;
            }
            clearAdminSession(key);
            const ok = addResult(session.level, session.code, trimmed);
            const lName = session.level === 1 ? 'الأول' : 'الثاني';
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تمت الإضافة للنتائج!*\n\nالمستوى: ${lName}\nالرقم الكودي: ${session.code}\n📊 إجمالي المستوى: ${resultsSize(session.level)} طالب`
                    : `❌ فشل حفظ النتيجة. حاول مجدداً.`
            }, { quoted: message });
            return true;
        }
    }

    // ── deleteresult_multiple (حذف متعدد للنتائج) ──
    if (session.type === 'deleteresult_multiple') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'codes';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `🗑️ *حذف متعدد من النتائج*\n\nأرسل الأكواد المراد حذفها مفصولة بفواصل:`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'codes') {
            const codes = trimmed.split(/[،,]+/).map(c => c.trim()).filter(Boolean);
            const result = deleteMultipleResults(session.level, codes);
            clearAdminSession(key);
            const lName = session.level === 1 ? 'الأول' : 'الثاني';
            await sock.sendMessage(chatId, {
                text:
                    `🗑️ *حذف متعدد من النتائج*\n\n` +
                    `✅ تم الحذف: *${result.deleted}*\n` +
                    `❌ لم يتم العثور: *${result.notFound}*\n` +
                    `${result.notFoundCodes.length > 0 ? `\nغير موجود: ${result.notFoundCodes.join(', ')}` : ''}\n\n` +
                    `🏆 إجمالي المستوى ${lName}: ${resultsSize(session.level)} طالب`
            }, { quoted: message });
            return true;
        }
    }

    // ── updateresult (تعديل نتيجة) ──
    if (session.type === 'updateresult') {
        if (session.step === 'level') {
            const n = parseInt(normalizeArabicNumerals(trimmed));
            if (n !== 1 && n !== 2) {
                await sock.sendMessage(chatId, { text: `⚠️ أرسل 1 للمستوى الأول أو 2 للثاني` }, { quoted: message });
                return true;
            }
            session.level = n;
            session.step = 'find';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `✏️ *تعديل نتيجة*\n\nأرسل الرقم الكودي للطالب الذي تريد تعديله:`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'find') {
            const entry = getResultEntry(session.level, trimmed);
            if (!entry) {
                clearAdminSession(key);
                await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على الرقم الكودي "${trimmed}"` }, { quoted: message });
                return true;
            }
            session.oldCode = trimmed;
            session.step = 'new_code';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `الرقم الحالي: ${trimmed}\nأرسل الرقم الكودي الجديد (أو "-" للإبقاء):`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_code') {
            session.newCode = (trimmed === '-') ? session.oldCode : trimmed;
            session.step = 'new_url';
            setAdminSession(key, session);
            await sock.sendMessage(chatId, {
                text: `أرسل رابط الشهادة الجديد:`
            }, { quoted: message });
            return true;
        }
        if (session.step === 'new_url') {
            if (!/^https?:\/\//.test(trimmed)) {
                await sock.sendMessage(chatId, { text: `❌ الرابط غير صحيح. أرسل رابطاً يبدأ بـ https://` }, { quoted: message });
                return true;
            }
            const ok = updateResult(session.level, session.oldCode, session.newCode, trimmed);
            clearAdminSession(key);
            await sock.sendMessage(chatId, {
                text: ok
                    ? `✅ *تم تعديل النتيجة بنجاح!*\n\n${session.newCode}`
                    : `❌ فشل تعديل النتيجة.`
            }, { quoted: message });
            return true;
        }
    }

    return false;
}

// ══════════════════════════════════════════════════════════════
// معالج الرسائل الرئيسي
// ══════════════════════════════════════════════════════════════
async function handleMessages(sock, messageUpdate) {
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;

        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        if (isBanned(senderId)) return;

        if (!message.key.fromMe && !isGroup) {
            registerSubscriber(senderId, message.pushName || '');
        }

        const rawText = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            message.message?.documentMessage?.caption ||
            message.message?.buttonsResponseMessage?.selectedButtonId ||
            message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            ''
        );

        const trimmed = normalizeArabicNumerals(rawText.trim());

        // ════════════════════════════════════════════════════
        // ADMIN: /admin <secret>
        // ════════════════════════════════════════════════════
        if (trimmed && isValidAdminCommand(trimmed)) {
            if (!isAdmin(senderId)) grantAdmin(senderId);
            await sock.sendMessage(chatId, { react: { text: '👑', key: message.key } });
            await sock.sendMessage(chatId, {
                text:
                    `👑 *لوحة الإدارة المتطورة v8*\n\n` +
                    `📂 *رفع الملفات:*\n` +
                    `/uploadlearn — رفع learn.xlsx\n` +
                    `/uploadcoptic — رفع coptic.xlsx\n` +
                    `/uploadnatiga — رفع natiga.xlsx\n` +
                    `/uploadsubs — رفع subscribers.xlsx\n\n` +
                    `➕ *إضافة فردية:*\n` +
                    `/addword — إضافة كلمة للقاموس (بالصيغة المطلوبة)\n` +
                    `/addresult — إضافة نتيجة\n` +
                    `/addlesson — إضافة درس\n\n` +
                    `🗑️ *حذف فردي:*\n` +
                    `/deleteword — حذف كلمة من القاموس (بالقبطية)\n` +
                    `/deleteresult — حذف نتيجة\n` +
                    `/deletelesson — حذف درس\n\n` +
                    `🔨 *حذف متعدد:*\n` +
                    `/deletewordmulti — حذف كلمات متعددة (بالقبطية)\n` +
                    `/deleteresultmulti — حذف نتائج متعددة\n` +
                    `/deletelessonmulti — حذف دروس متعددة\n\n` +
                    `✏️ *تعديل:*\n` +
                    `/updateword — تعديل كلمة في القاموس\n` +
                    `/updateresult — تعديل نتيجة\n` +
                    `/updatelesson — تعديل درس\n\n` +
                    `📦 *إضافة جماعية:*\n` +
                    `/batchword — إضافة كلمات جماعية\n` +
                    `/batchresult — إضافة نتائج جماعية\n` +
                    `/batchlesson — إضافة دروس جماعية\n\n` +
                    `📥 *تنزيل:*\n` +
                    `/download — قائمة التنزيلات\n` +
                    `/downloadlearn — تنزيل ملف التعلم\n` +
                    `/downloadcoptic — تنزيل ملف القاموس\n` +
                    `/downloadresults — تنزيل ملف النتائج\n` +
                    `/downloadsubs — تنزيل ملف المشتركين\n` +
                    `/downloadall — تنزيل جميع الملفات\n\n` +
                    `📊 *إحصائيات:*\n` +
                    `/stats — إحصائيات النظام\n` +
                    `/mystats — إحصائيات استخدامك\n\n` +
                    `📢 *بث:*\n` +
                    `/broadcast — رسالة جماعية\n\n` +
                    `🔄 *إعادة تحميل:*\n` +
                    `/reload — إعادة تحميل قواعد البيانات\n\n` +
                    `🚪 /logout — تسجيل الخروج من الإدارة`
            }, { quoted: message });
            return;
        }

        // ════════════════════════════════════════════════════
        // ADMIN: رفع ملفات مباشرة
        // ════════════════════════════════════════════════════
        if (isAdmin(senderId)) {
            if (await handleDirectLearnUpload(sock, chatId, message, senderId)) return;
            if (await handleDirectCoptocUpload(sock, chatId, message, senderId)) return;
            if (await handleDirectResultsUpload(sock, chatId, message, senderId)) return;
            if (await handleDirectSubscribersUpload(sock, chatId, message, senderId)) return;
        }

        // ── انتظار ملفات رفع ────────────────────────────────
        if (isAdmin(senderId) && isWaitingForLearnUpload(chatId, senderId)) {
            if (await handleLearnUploadReply(sock, chatId, message, senderId)) return;
        }
        if (isAdmin(senderId) && isWaitingForCoptocUpload(chatId, senderId)) {
            if (await handleCoptocUploadReply(sock, chatId, message, senderId)) return;
        }
        if (isAdmin(senderId) && isWaitingForResultsUpload(chatId, senderId)) {
            if (await handleResultsUploadReply(sock, chatId, message, senderId)) return;
        }
        if (isAdmin(senderId) && isWaitingForSubscribersUpload(chatId, senderId)) {
            if (await handleSubscribersUploadReply(sock, chatId, message, senderId)) return;
        }

        if (!trimmed) return;

        const lower = trimmed.toLowerCase();

        // ════════════════════════════════════════════════════
        // "/" وحدها → قائمة أدمن
        // ════════════════════════════════════════════════════
        if (trimmed === '/') {
            if (isAdmin(senderId)) {
                await sock.sendMessage(chatId, {
                    text:
                        `👑 *لوحة الإدارة*\n\n` +
                        `/uploadlearn /uploadcoptic /uploadnatiga /uploadsubs\n` +
                        `/addword /addresult /addlesson\n` +
                        `/deleteword /deleteresult /deletelesson\n` +
                        `/deletewordmulti /deleteresultmulti /deletelessonmulti\n` +
                        `/updateword /updateresult /updatelesson\n` +
                        `/batchword /batchresult /batchlesson\n` +
                        `/download /downloadlearn /downloadcoptic /downloadresults /downloadsubs /downloadall\n` +
                        `/stats /mystats /broadcast /reload /logout`
                }, { quoted: message });
            } else {
                await showMainMenu(sock, chatId, message);
            }
            return;
        }

        // ════════════════════════════════════════════════════
        // جلسات البث
        // ════════════════════════════════════════════════════
        if (isAdmin(senderId) && isInBroadcastSession(chatId, senderId)) {
            if (await handleBroadcastSession(sock, chatId, message, senderId, trimmed)) return;
        }

        // ════════════════════════════════════════════════════
        // جلسات الإضافة اليدوية للأدمن
        // ════════════════════════════════════════════════════
        if (isAdmin(senderId) && !lower.startsWith('/')) {
            if (await handleAdminSession(sock, chatId, message, senderId, trimmed)) return;
        }

        // ════════════════════════════════════════════════════
        // 00 → القائمة الرئيسية
        // ════════════════════════════════════════════════════
        if (!lower.startsWith('/') && isMainMenuCommand(trimmed)) {
            await showMainMenu(sock, chatId, message);
            return;
        }

        // ════════════════════════════════════════════════════
        // رجوع (0)
        // ════════════════════════════════════════════════════
        if (!lower.startsWith('/') && isBackCommand(trimmed)) {
            await handleBack(sock, chatId, message);
            return;
        }

        // ════════════════════════════════════════════════════
        // جلسات المستخدم
        // ════════════════════════════════════════════════════
        if (!lower.startsWith('/')) {
            const activeMode = getActiveMode(chatId);

            if (activeMode === 'learn') {
                const r = await handleLearnSession(sock, chatId, message, trimmed);
                if (r.handled) return;
                await showMainMenu(sock, chatId, message);
                return;
            }

            if (activeMode === 'dict') {
                await handleCoptocReply(sock, chatId, message, trimmed);
                return;
            }

            if (activeMode === 'results') {
                const r = await handleResultsSession(sock, chatId, message, trimmed);
                if (r.handled) return;
                await showMainMenu(sock, chatId, message);
                return;
            }

            const choice = parseMenuChoice(trimmed);
            if (choice === 1) { await enterLearnMode(sock, chatId, message, senderId); return; }
            if (choice === 2) { await enterDictMode(sock, chatId, message, senderId); return; }
            if (choice === 3) { await enterResultsMode(sock, chatId, message, senderId); return; }

            await showMainMenu(sock, chatId, message);
            return;
        }

        // ════════════════════════════════════════════════════
        // الأوامر (/)
        // ════════════════════════════════════════════════════
        console.log(`📝 [${isGroup ? 'G' : 'P'}][ADM:${isAdmin(senderId)}] ${lower}`);

        switch (true) {

            case lower === '/start':
            case lower === '/menu':
            case lower === '/help':
                await showMainMenu(sock, chatId, message);
                break;

            case lower === '/owner':
                await ownerCommand(sock, chatId, message);
                break;

            case lower === '/learn' || lower === '/تعلم':
                await enterLearnMode(sock, chatId, message, senderId);
                break;

            case lower === '/coptoc' || lower === '/قاموس' || lower === '/معجم' || lower === '/coptic':
                await enterDictMode(sock, chatId, message, senderId);
                break;

            case lower === '/results' || lower === '/نتيجة' || lower === '/شهادة' || lower === '/natiga':
                await enterResultsMode(sock, chatId, message, senderId);
                break;

            case lower === '/mystats': {
                const stats = getUserStats(senderId);
                if (!stats) {
                    await sock.sendMessage(chatId, { text: `📊 لا توجد إحصائيات متاحة لك بعد. استخدم البوت أكثر لتسجيل إحصائياتك.` }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, {
                        text:
                            `📊 *إحصائيات استخدامك*\n\n` +
                            `👤 الاسم: ${stats.name || 'غير معروف'}\n` +
                            `📱 الرقم: ${stats.phone}\n` +
                            `📚 عدد مرات استخدام التعلم: *${stats.learnCount || 0}*\n` +
                            `📖 عدد مرات استخدام القاموس: *${stats.dictCount || 0}*\n` +
                            `🏆 عدد مرات استخدام النتيجة: *${stats.resultsCount || 0}*\n` +
                            `🕐 أول تفاعل: ${new Date(stats.firstSeen).toLocaleString('ar-EG')}\n` +
                            `🕐 آخر تفاعل: ${new Date(stats.lastSeen).toLocaleString('ar-EG')}`
                    }, { quoted: message });
                }
                break;
            }

            case lower === '/logout': {
                if (!isAdmin(senderId)) {
                    await sock.sendMessage(chatId, { text: `❌ أنت لست أدمناً.` }, { quoted: message });
                    break;
                }
                clearAdminSession(chatId + senderId);
                revokeAdmin(senderId);
                await sock.sendMessage(chatId, { text: `✅ تم تسجيل الخروج من الإدارة.` }, { quoted: message });
                break;
            }

            // ── رفع الملفات ──────────────────────────────────
            case lower === '/uploadlearn': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await uploadLearnCommand(sock, chatId, message, senderId);
                break;
            }

            case lower === '/uploadcoptic' || lower === '/uploadcoptoc': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await uploadCoptocCommand(sock, chatId, message, senderId);
                break;
            }

            case lower === '/uploadnatiga' || lower === '/uploadresults': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await uploadResultsCommand(sock, chatId, message, senderId);
                break;
            }

            case lower === '/uploadsubs' || lower === '/uploadsubscribers': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await uploadSubscribersCommand(sock, chatId, message, senderId);
                break;
            }

            // ── إضافة فردية جديدة بالشكل المطلوب ──────────────────
            case lower === '/addword': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'addword_formatted', step: 'cell' });
                await sock.sendMessage(chatId, {
                    text:
                        `➕ *إضافة كلمة للقاموس*\n\n` +
                        `أرسل العبارة كاملة بالصيغة التالية:\n\n` +
                        `(الكلمات العربية). (الكلمة القبطية). (الأصل). (النوع).mp3\n\n` +
                        `مثال:\n` +
                        `نور، عمل، جميل، لبن. ϧⲓⲥⲓ. قبطية. فعل.mp3\n\n` +
                        `بعدها سأطلب منك رابط الصوت.`
                }, { quoted: message });
                break;
            }

            case lower === '/addresult': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'addresult_formatted', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `➕ *إضافة نتيجة*\n\nالخطوة 1/3 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            case lower === '/addlesson': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'addlesson_formatted', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `➕ *إضافة درس*\n\nالخطوة 1/3 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            // ── حذف فردي (بالقبطية) ──────────────────────────────
            case lower === '/deleteword': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deleteword_coptic', step: 'word' });
                await sock.sendMessage(chatId, {
                    text: `🗑️ *حذف كلمة من القاموس*\n\nأرسل الكلمة القبطية التي تريد حذفها:`
                }, { quoted: message });
                break;
            }

            case lower === '/deleteresult': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deleteresult', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `🗑️ *حذف نتيجة*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            case lower === '/deletelesson': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deletelesson', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `🗑️ *حذف درس*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            // ── حذف متعدد ──────────────────────────────────────
            case lower === '/deletewordmulti': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deleteword_multiple', step: 'words' });
                await sock.sendMessage(chatId, {
                    text:
                        `🗑️ *حذف متعدد من القاموس*\n\n` +
                        `أرسل الكلمات القبطية المراد حذفها مفصولة بفواصل:\n\n` +
                        `مثال: ϧⲓⲥⲓ, ⲛⲟⲩⲧⲉ, ⲣⲱⲙⲓ`
                }, { quoted: message });
                break;
            }

            case lower === '/deleteresultmulti': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deleteresult_multiple', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `🗑️ *حذف متعدد من النتائج*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            case lower === '/deletelessonmulti': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'deletelesson_multiple', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `🗑️ *حذف متعدد من الدروس*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            // ── تعديل ──────────────────────────────────────────
            case lower === '/updateword': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'updateword', step: 'find' });
                await sock.sendMessage(chatId, {
                    text: `✏️ *تعديل كلمة في القاموس*\n\nأرسل الكلمة القبطية التي تريد تعديلها:`
                }, { quoted: message });
                break;
            }

            case lower === '/updateresult': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'updateresult', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `✏️ *تعديل نتيجة*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            case lower === '/updatelesson': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                setAdminSession(chatId + senderId, { type: 'updatelesson', step: 'level' });
                await sock.sendMessage(chatId, {
                    text: `✏️ *تعديل درس*\n\nالخطوة 1/2 — أرسل رقم المستوى:\n1 للمستوى الأول\n2 للمستوى الثاني`
                }, { quoted: message });
                break;
            }

            // ── إضافة جماعية ─────────────────────────────────────
            case lower === '/batchword': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sock.sendMessage(chatId, {
                    text:
                        `📦 *إضافة كلمات جماعية للقاموس*\n\n` +
                        `صيغة كل سطر:\n` +
                        `(الكلمات العربية). (الكلمة القبطية). (الأصل). (النوع).mp3 | رابط_الصوت\n\n` +
                        `مثال:\n` +
                        `نور، عمل، جميل، لبن. ϧⲓⲥⲓ. قبطية. فعل.mp3 | https://drive.google.com/...\n\n` +
                        `أرسل البيانات الآن في رسالة واحدة:`
                }, { quoted: message });
                setAdminSession(chatId + senderId, { type: 'batchword_wait', step: 'data' });
                break;
            }

            case lower === '/batchresult': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sock.sendMessage(chatId, {
                    text:
                        `📦 *إضافة نتائج جماعية*\n\n` +
                        `صيغة كل سطر:\n` +
                        `المستوى | الرقم الكودي | رابط الشهادة\n\n` +
                        `مثال:\n` +
                        `1 | 1001 | https://drive.google.com/...\n` +
                        `2 | 2001 | https://drive.google.com/...\n\n` +
                        `أرسل البيانات الآن في رسالة واحدة:`
                }, { quoted: message });
                setAdminSession(chatId + senderId, { type: 'batchresult_wait', step: 'data' });
                break;
            }

            case lower === '/batchlesson': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sock.sendMessage(chatId, {
                    text:
                        `📦 *إضافة دروس جماعية*\n\n` +
                        `صيغة كل سطر:\n` +
                        `المستوى | اسم الدرس | رابط الفيديو\n\n` +
                        `مثال:\n` +
                        `1 | الدرس الأول | https://drive.google.com/...\n` +
                        `2 | مقدمة المستوى الثاني | https://drive.google.com/...\n\n` +
                        `أرسل البيانات الآن في رسالة واحدة:`
                }, { quoted: message });
                setAdminSession(chatId + senderId, { type: 'batchlesson_wait', step: 'data' });
                break;
            }

            // ── تنزيل انتقائي ─────────────────────────────────────
            case lower === '/download': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendSelectiveDownloads(sock, chatId, message);
                break;
            }

            case lower === '/downloadlearn': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendLearnDownload(sock, chatId, message);
                break;
            }

            case lower === '/downloadcoptic': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendCopticDownload(sock, chatId, message);
                break;
            }

            case lower === '/downloadresults': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendResultsDownload(sock, chatId, message);
                break;
            }

            case lower === '/downloadsubs': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendSubscribersDownload(sock, chatId, message);
                break;
            }

            case lower === '/downloadall': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendAllDownloads(sock, chatId, message);
                break;
            }

            // ── إحصائيات ──────────────────────────────────────
            case lower === '/stats' || lower === '/dbstats': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                await sendStats(sock, chatId, message);
                break;
            }

            // ── البث الجماعي ──────────────────────────────────
            case lower.startsWith('/broadcast'): {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                const argsText = trimmed.slice('/broadcast'.length).trim();
                await broadcastCommand(sock, chatId, message, senderId, argsText);
                break;
            }

            // ── إعادة تحميل قواعد البيانات ─────────────────────
            case lower === '/reload': {
                if (!isAdmin(senderId)) { await sock.sendMessage(chatId, { text: `❌ للأدمن فقط.` }, { quoted: message }); break; }
                reloadLearnDb();
                reloadCoptocDb();
                reloadResultsDb();
                await sock.sendMessage(chatId, { text: `✅ تم إعادة تحميل جميع قواعد البيانات.` }, { quoted: message });
                break;
            }

            default:
                await showMainMenu(sock, chatId, message);
                break;
        }

    } catch (err) {
        console.error('❌ handleMessages:', err);
    }
}

// ── معالجة البيانات الجماعية المنتظَرة بعد أمر /batch* ─────
const _origHandleMessages = handleMessages;

async function handleMessagesWithBatch(sock, messageUpdate) {
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') { await _origHandleMessages(sock, messageUpdate); return; }

        const message = messages[0];
        if (!message?.message) { await _origHandleMessages(sock, messageUpdate); return; }

        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;

        if (isAdmin(senderId)) {
            const rawText = (
                message.message?.conversation ||
                message.message?.extendedTextMessage?.text || ''
            );
            const trimmed = normalizeArabicNumerals(rawText.trim());

            if (trimmed && !trimmed.startsWith('/')) {
                const key = chatId + senderId;
                const session = getAdminSession(key);
                if (session) {
                    if (session.type === 'batchword_wait') {
                        clearAdminSession(key);
                        await handleBatchWord(sock, chatId, message, trimmed);
                        return;
                    }
                    if (session.type === 'batchresult_wait') {
                        clearAdminSession(key);
                        await handleBatchResult(sock, chatId, message, trimmed);
                        return;
                    }
                    if (session.type === 'batchlesson_wait') {
                        clearAdminSession(key);
                        await handleBatchLesson(sock, chatId, message, trimmed);
                        return;
                    }
                }
            }
        }

        await _origHandleMessages(sock, messageUpdate);
    } catch (err) {
        console.error('❌ handleMessagesWithBatch:', err);
        await _origHandleMessages(sock, messageUpdate);
    }
}

// ── دوال معالجة البيانات الجماعية ─────────────────────────────
async function handleBatchWord(sock, chatId, message, text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let added = 0, failed = 0;
    const errors = [];

    for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        const cellContent = parts[0];
        const audioUrl = parts[1] || null;
        
        if (!cellContent) {
            failed++;
            errors.push('سطر فارغ');
            continue;
        }
        
        const ok = addWordFormatted(cellContent, audioUrl);
        if (ok) {
            added++;
        } else {
            failed++;
            errors.push(cellContent.substring(0, 50) + '...');
        }
    }

    await sock.sendMessage(chatId, {
        text:
            `✅ *تمت المعالجة الجماعية للقاموس!*\n\n` +
            `➕ مضاف: *${added}*\n` +
            `❌ فشل: *${failed}*\n` +
            `${errors.length > 0 && errors.length <= 5 ? `\n⚠️ الأخطاء:\n${errors.join('\n')}` : ''}\n\n` +
            `📊 إجمالي القاموس: *${coptocSize()} كلمة*`
    }, { quoted: message });
}

async function handleBatchResult(sock, chatId, message, text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let l1 = 0, l2 = 0, failed = 0;

    for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 3) { failed++; continue; }
        const level = parseInt(normalizeArabicNumerals(parts[0]));
        const code = parts[1];
        const url = parts[2];
        if ((level !== 1 && level !== 2) || !code || !url) { failed++; continue; }
        const ok = addResult(level, code, url);
        ok ? (level === 1 ? l1++ : l2++) : failed++;
    }

    await sock.sendMessage(chatId, {
        text:
            `✅ *تمت المعالجة الجماعية للنتائج!*\n\n` +
            `🏆 المستوى الأول: *${l1} مضاف*\n` +
            `🏆 المستوى الثاني: *${l2} مضاف*\n` +
            `❌ فشل: *${failed}*\n` +
            `📊 الإجمالي: الأول ${resultsSize(1)} | الثاني ${resultsSize(2)}`
    }, { quoted: message });
}

async function handleBatchLesson(sock, chatId, message, text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let l1 = 0, l2 = 0, failed = 0;

    for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 3) { failed++; continue; }
        const level = parseInt(normalizeArabicNumerals(parts[0]));
        const name = parts[1];
        const url = parts[2];
        if ((level !== 1 && level !== 2) || !name || !url) { failed++; continue; }
        const ok = addLesson(level, name, url);
        ok ? (level === 1 ? l1++ : l2++) : failed++;
    }

    await sock.sendMessage(chatId, {
        text:
            `✅ *تمت المعالجة الجماعية للدروس!*\n\n` +
            `📚 المستوى الأول: *${l1} درس مضاف*\n` +
            `📚 المستوى الثاني: *${l2} درس مضاف*\n` +
            `❌ فشل: *${failed}*\n` +
            `📊 الإجمالي: الأول ${learnDbSize(1)} | الثاني ${learnDbSize(2)}`
    }, { quoted: message });
}

module.exports = {
    handleMessages: handleMessagesWithBatch,
    handleGroupParticipantUpdate: async () => {},
    handleStatus: async () => {}
};