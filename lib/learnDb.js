/**
 * learnDb.js — قاعدة بيانات دروس اللغة القبطية v2
 * تمت الإضافة: حذف متعدد، تعديل، إحصائيات المستخدمين
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../data/learn.xlsx');

let level1Lessons = [];
let level2Lessons = [];

function convertDriveUrl(url) {
    if (!url) return null;
    url = url.trim();
    const match = url.match(/\/file\/d\/([^\/\?]+)/);
    if (match && match[1]) {
        return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return url;
}

function loadSheet(wb, sheetName) {
    const XLSX = require('xlsx');
    const ws = wb.Sheets[sheetName]
            || wb.Sheets[sheetName.toLowerCase()]
            || wb.Sheets[sheetName.toUpperCase()];
    if (!ws) return [];

    const rows    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const lessons = [];

    for (let i = 0; i < rows.length; i++) {
        const name = String(rows[i][0] || '').trim();
        const url  = String(rows[i][1] || '').trim();
        if (!name) continue;
        lessons.push({ 
            id: Date.now() + '_' + i + '_' + Math.random(),
            name, 
            videoUrl: url ? convertDriveUrl(url) : null 
        });
    }
    return lessons;
}

function reloadLearnDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            console.warn('⚠️ learn.xlsx غير موجود في data/');
            level1Lessons = [];
            level2Lessons = [];
            return false;
        }

        const XLSX = require('xlsx');
        const wb   = XLSX.readFile(DB_PATH);

        level1Lessons = loadSheet(wb, 'level1');
        level2Lessons = loadSheet(wb, 'level2');

        console.log(`✅ learn.xlsx محمّل — المستوى الأول: ${level1Lessons.length} | المستوى الثاني: ${level2Lessons.length}`);
        return true;
    } catch (err) {
        console.error('❌ خطأ في تحميل learn.xlsx:', err.message);
        level1Lessons = [];
        level2Lessons = [];
        return false;
    }
}

function getLessons(level) {
    return level === 1 ? level1Lessons : level2Lessons;
}

function learnDbSize(level) {
    return level === 1 ? level1Lessons.length : level2Lessons.length;
}

function addLesson(level, name, videoUrl) {
    const lessons = level === 1 ? level1Lessons : level2Lessons;
    const existing = lessons.findIndex(l => l.name === name);
    const newLesson = { 
        id: Date.now() + '_' + Math.random(),
        name, 
        videoUrl: videoUrl ? convertDriveUrl(videoUrl) : null 
    };
    
    if (existing >= 0) {
        lessons[existing] = newLesson;
    } else {
        lessons.push(newLesson);
    }
    return saveLearnDb();
}

// ========== دوال الحذف المتعدد ==========
function deleteLesson(level, lessonName) {
    const lessons = level === 1 ? level1Lessons : level2Lessons;
    const index = lessons.findIndex(l => l.name === lessonName);
    
    if (index !== -1) {
        lessons.splice(index, 1);
        return saveLearnDb();
    }
    return false;
}

function deleteMultipleLessons(level, lessonNames) {
    const lessons = level === 1 ? level1Lessons : level2Lessons;
    let deleted = 0;
    let notFound = 0;
    const notFoundNames = [];
    
    for (const name of lessonNames) {
        const index = lessons.findIndex(l => l.name === name);
        if (index !== -1) {
            lessons.splice(index, 1);
            deleted++;
        } else {
            notFound++;
            notFoundNames.push(name);
        }
    }
    
    if (deleted > 0) {
        saveLearnDb();
    }
    
    return { deleted, notFound, notFoundNames };
}

function deleteLessonByIndex(level, index) {
    const lessons = level === 1 ? level1Lessons : level2Lessons;
    
    if (index >= 0 && index < lessons.length) {
        lessons.splice(index, 1);
        return saveLearnDb();
    }
    return false;
}

// ========== دالة تعديل الدرس ==========
function updateLesson(level, oldName, newName, newVideoUrl) {
    const lessons = level === 1 ? level1Lessons : level2Lessons;
    const index = lessons.findIndex(l => l.name === oldName);
    
    if (index !== -1) {
        lessons[index] = {
            id: lessons[index].id,
            name: newName,
            videoUrl: newVideoUrl ? convertDriveUrl(newVideoUrl) : lessons[index].videoUrl
        };
        return saveLearnDb();
    }
    return false;
}

// ========== دالة الحصول على جميع الدروس ==========
function getAllLessons(level) {
    return level === 1 ? [...level1Lessons] : [...level2Lessons];
}

function saveLearnDb() {
    try {
        const XLSX = require('xlsx');
        const wb   = XLSX.utils.book_new();

        const makeSheet = (lessons) => {
            const rows = lessons.map(l => [l.name, l.videoUrl || '']);
            const ws   = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 40 }, { wch: 80 }];
            return ws;
        };

        XLSX.utils.book_append_sheet(wb, makeSheet(level1Lessons), 'level1');
        XLSX.utils.book_append_sheet(wb, makeSheet(level2Lessons), 'level2');
        XLSX.writeFile(wb, DB_PATH);
        return true;
    } catch (err) {
        console.error('❌ خطأ في حفظ learn.xlsx:', err.message);
        return false;
    }
}

function exportLearnXlsx() {
    try {
        const XLSX = require('xlsx');
        const wb   = XLSX.utils.book_new();

        const makeSheet = (lessons, sheetName) => {
            const rows = [['اسم الدرس', 'رابط الفيديو']];
            for (const l of lessons) rows.push([l.name, l.videoUrl || '']);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 40 }, { wch: 80 }];
            return ws;
        };

        XLSX.utils.book_append_sheet(wb, makeSheet(level1Lessons, 'level1'), 'level1');
        XLSX.utils.book_append_sheet(wb, makeSheet(level2Lessons, 'level2'), 'level2');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (e) {
        console.error('❌ فشل تصدير learnDb xlsx:', e.message);
        return null;
    }
}

reloadLearnDb();

module.exports = { 
    reloadLearnDb, 
    getLessons, 
    getAllLessons,
    addLesson, 
    deleteLesson,
    deleteMultipleLessons,
    deleteLessonByIndex,
    updateLesson,
    saveLearnDb, 
    exportLearnXlsx, 
    learnDbSize, 
    convertDriveUrl 
};