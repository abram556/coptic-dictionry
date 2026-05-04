/**
 * resultsDb.js — قاعدة بيانات نتائج اللغة القبطية v2
 * تمت الإضافة: حذف متعدد، تعديل، إحصائيات
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../data/natiga.xlsx');

let level1Map = {};
let level2Map = {};
let level1Entries = [];
let level2Entries = [];

function convertToImageUrl(url) {
    if (!url) return null;
    url = url.trim();
    const slidesMatch = url.match(/\/presentation\/d\/([^\/\?]+)/);
    if (slidesMatch && slidesMatch[1]) {
        return `https://docs.google.com/presentation/d/${slidesMatch[1]}/export/png`;
    }
    const driveMatch = url.match(/\/file\/d\/([^\/\?]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    return url;
}

function loadResultSheet(wb, sheetName) {
    const XLSX = require('xlsx');
    
    let ws = wb.Sheets[sheetName];
    if (!ws) {
        const lowerName = sheetName.toLowerCase();
        const foundSheet = wb.SheetNames.find(name => name.toLowerCase() === lowerName);
        if (foundSheet) {
            ws = wb.Sheets[foundSheet];
        }
    }
    
    if (!ws) {
        console.warn(`⚠️ لم يتم العثور على ورقة باسم "${sheetName}"`);
        return { map: {}, entries: [] };
    }
    
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const map = {};
    const entries = [];
    
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i] || rows[i].length < 2) continue;
        
        const code = String(rows[i][0] || '').trim();
        const url = String(rows[i][1] || '').trim();
        
        if (code && url && 
            !code.includes('الرقم') && 
            !code.includes('كود') && 
            !code.includes('code') &&
            !url.includes('رابط') && 
            !url.includes('link')) {
            
            const entry = {
                id: Date.now() + '_' + i + '_' + Math.random(),
                code: code,
                url: convertToImageUrl(url),
                originalUrl: url
            };
            map[code] = entry;
            entries.push(entry);
        }
    }
    
    console.log(`📊 تم تحميل ${entries.length} سجل من ورقة "${sheetName}"`);
    return { map, entries };
}

function reloadResultsDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            console.warn('⚠️ natiga.xlsx غير موجود في data/');
            level1Map = {};
            level2Map = {};
            level1Entries = [];
            level2Entries = [];
            return false;
        }

        const XLSX = require('xlsx');
        const wb = XLSX.readFile(DB_PATH);
        
        console.log('📁 أسماء الأوراق في natiga.xlsx:', wb.SheetNames);
        
        let newLevel1Map = {};
        let newLevel2Map = {};
        let newLevel1Entries = [];
        let newLevel2Entries = [];
        
        // تحميل المستوى الأول
        const possibleLevel1Names = ['level1', 'Level1', 'LEVEL1', 'المستوى الأول', 'level 1', 'Level 1'];
        for (const name of possibleLevel1Names) {
            const result = loadResultSheet(wb, name);
            if (result.entries.length > 0) {
                newLevel1Map = result.map;
                newLevel1Entries = result.entries;
                console.log(`✅ تم تحميل المستوى الأول من ورقة "${name}" مع ${result.entries.length} سجل`);
                break;
            }
        }
        
        // تحميل المستوى الثاني
        const possibleLevel2Names = ['level2', 'Level2', 'LEVEL2', 'المستوى الثاني', 'level 2', 'Level 2'];
        for (const name of possibleLevel2Names) {
            const result = loadResultSheet(wb, name);
            if (result.entries.length > 0) {
                newLevel2Map = result.map;
                newLevel2Entries = result.entries;
                console.log(`✅ تم تحميل المستوى الثاني من ورقة "${name}" مع ${result.entries.length} سجل`);
                break;
            }
        }
        
        level1Map = newLevel1Map;
        level2Map = newLevel2Map;
        level1Entries = newLevel1Entries;
        level2Entries = newLevel2Entries;
        
        console.log(`✅ natiga.xlsx — المستوى الأول: ${level1Entries.length} | الثاني: ${level2Entries.length}`);
        
        return true;
    } catch (err) {
        console.error('❌ خطأ في تحميل natiga.xlsx:', err.message);
        level1Map = {};
        level2Map = {};
        level1Entries = [];
        level2Entries = [];
        return false;
    }
}

function lookupResult(level, code) {
    const map = level === 1 ? level1Map : level2Map;
    const searchCode = String(code).trim();
    
    let result = map[searchCode];
    
    if (!result && !isNaN(searchCode)) {
        const asNumber = parseInt(searchCode, 10).toString();
        if (asNumber !== searchCode) {
            result = map[asNumber];
        }
    }
    
    return result ? result.url : null;
}

function getResultEntry(level, code) {
    const map = level === 1 ? level1Map : level2Map;
    const searchCode = String(code).trim();
    return map[searchCode] || null;
}

function resultsSize(level) {
    return level === 1 ? level1Entries.length : level2Entries.length;
}

function addResult(level, code, url) {
    const entries = level === 1 ? level1Entries : level2Entries;
    const map = level === 1 ? level1Map : level2Map;
    const cleanCode = String(code).trim();
    const convertedUrl = convertToImageUrl(url);
    
    const existingIndex = entries.findIndex(e => e.code === cleanCode);
    const newEntry = {
        id: Date.now() + '_' + Math.random(),
        code: cleanCode,
        url: convertedUrl,
        originalUrl: url
    };
    
    if (existingIndex !== -1) {
        entries[existingIndex] = newEntry;
    } else {
        entries.push(newEntry);
    }
    
    map[cleanCode] = newEntry;
    
    console.log(`✅ تم إضافة/تحديث الكود ${cleanCode} إلى المستوى ${level}`);
    return saveResultsDb();
}

// ========== دوال الحذف ==========
function deleteResult(level, code) {
    const entries = level === 1 ? level1Entries : level2Entries;
    const map = level === 1 ? level1Map : level2Map;
    const cleanCode = String(code).trim();
    
    const index = entries.findIndex(e => e.code === cleanCode);
    if (index !== -1) {
        entries.splice(index, 1);
        delete map[cleanCode];
        return saveResultsDb();
    }
    return false;
}

function deleteMultipleResults(level, codes) {
    const entries = level === 1 ? level1Entries : level2Entries;
    const map = level === 1 ? level1Map : level2Map;
    let deleted = 0;
    let notFound = 0;
    const notFoundCodes = [];
    
    for (const code of codes) {
        const cleanCode = String(code).trim();
        const index = entries.findIndex(e => e.code === cleanCode);
        if (index !== -1) {
            entries.splice(index, 1);
            delete map[cleanCode];
            deleted++;
        } else {
            notFound++;
            notFoundCodes.push(code);
        }
    }
    
    if (deleted > 0) {
        saveResultsDb();
    }
    
    return { deleted, notFound, notFoundCodes };
}

// ========== دالة تعديل ==========
function updateResult(level, oldCode, newCode, newUrl) {
    const entries = level === 1 ? level1Entries : level2Entries;
    const map = level === 1 ? level1Map : level2Map;
    const cleanOldCode = String(oldCode).trim();
    const cleanNewCode = String(newCode).trim();
    
    const index = entries.findIndex(e => e.code === cleanOldCode);
    if (index !== -1) {
        const convertedUrl = convertToImageUrl(newUrl);
        const updatedEntry = {
            id: entries[index].id,
            code: cleanNewCode,
            url: convertedUrl,
            originalUrl: newUrl
        };
        
        entries[index] = updatedEntry;
        delete map[cleanOldCode];
        map[cleanNewCode] = updatedEntry;
        
        return saveResultsDb();
    }
    return false;
}

// ========== دوال الحصول على البيانات ==========
function getAllResults(level) {
    return level === 1 ? [...level1Entries] : [...level2Entries];
}

function saveResultsDb() {
    try {
        const XLSX = require('xlsx');
        const wb   = XLSX.utils.book_new();
        
        const makeSheet = (entries, sheetName) => {
            const rows = [['الرقم الكودي', 'رابط الشهادة']];
            const sortedEntries = [...entries].sort((a, b) => {
                const numA = parseInt(a.code, 10);
                const numB = parseInt(b.code, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a.code).localeCompare(String(b.code));
            });
            
            for (const entry of sortedEntries) {
                rows.push([entry.code, entry.originalUrl || entry.url]);
            }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 20 }, { wch: 80 }];
            return ws;
        };
        
        const sheet1 = makeSheet(level1Entries, 'level1');
        const sheet2 = makeSheet(level2Entries, 'level2');
        
        XLSX.utils.book_append_sheet(wb, sheet1, 'level1');
        XLSX.utils.book_append_sheet(wb, sheet2, 'level2');
        
        XLSX.writeFile(wb, DB_PATH);
        
        console.log(`✅ تم حفظ البيانات بنجاح في natiga.xlsx`);
        console.log(`📊 المستوى الأول: ${level1Entries.length} سجل`);
        console.log(`📊 المستوى الثاني: ${level2Entries.length} سجل`);
        
        return true;
    } catch (err) {
        console.error('❌ خطأ في حفظ natiga.xlsx:', err.message);
        return false;
    }
}

function exportResultsXlsx() {
    try {
        const XLSX = require('xlsx');
        const wb   = XLSX.utils.book_new();
        
        const makeSheet = (entries, sheetName) => {
            const rows = [['الرقم الكودي', 'رابط الشهادة']];
            const sortedEntries = [...entries].sort((a, b) => {
                const numA = parseInt(a.code, 10);
                const numB = parseInt(b.code, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a.code).localeCompare(String(b.code));
            });
            
            for (const entry of sortedEntries) {
                rows.push([entry.code, entry.originalUrl || entry.url]);
            }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 20 }, { wch: 80 }];
            return ws;
        };
        
        XLSX.utils.book_append_sheet(wb, makeSheet(level1Entries, 'level1'), 'level1');
        XLSX.utils.book_append_sheet(wb, makeSheet(level2Entries, 'level2'), 'level2');
        
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (e) {
        console.error('❌ فشل تصدير resultsDb xlsx:', e.message);
        return null;
    }
}

reloadResultsDb();

module.exports = { 
    reloadResultsDb, 
    lookupResult, 
    getResultEntry,
    resultsSize, 
    addResult, 
    deleteResult,
    deleteMultipleResults,
    updateResult,
    getAllResults,
    saveResultsDb, 
    exportResultsXlsx 
};