/**
 * coptocDb.js — قاعدة بيانات المعجم القبطي-العربي v9.3
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../data/coptic.xlsx');

let arabicToCoptic = {};
let copticToArabic = {};
let fullEntries = [];

const TYPE_WORDS = new Set([
    'مذكر','مذكرة','مؤنث','مؤنثة','جمع','مفرد',
    'فعل','اسم','صفة','ظرف','حرف','ضمير','عدد',
    'اسم مذكر','اسم مؤنث','فعل ماض','فعل مضارع'
]);

const ORIGIN_WORDS = new Set([
    'قبطي','قبطية','يوناني','يونانية','لاتيني','لاتينية',
    'عبري','عبرية','آرامي','آرامية','ارامي','ارامية',
    'أرامي','أرامية','عربي','عربية','مصري','مصرية'
]);

function removeDiacritics(text) {
    if (!text) return text;
    return text.replace(/[\u064B-\u065F\u0670]/g, '');
}

function normalizeArabic(text) {
    if (!text) return text;
    return text
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ة]/g, 'ه')
        .replace(/[ؤ]/g, 'و')
        .replace(/[ئ]/g, 'ى')
        .replace(/[ى]/g, 'ي');
}

function convertToDirectUrl(url) {
    if (!url) return null;
    url = url.trim();
    const driveFileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch) return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
    const openIdMatch = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
    if (openIdMatch) return `https://drive.google.com/uc?export=download&id=${openIdMatch[1]}`;
    const ucMatch = url.match(/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if (ucMatch && !url.includes('export=download')) return `https://drive.google.com/uc?export=download&id=${ucMatch[1]}`;
    const slidesMatch = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (slidesMatch) return `https://docs.google.com/presentation/d/${slidesMatch[1]}/export/png`;
    if (url.includes('dropbox.com')) return url.replace('?dl=0','?dl=1').replace('www.dropbox.com','dl.dropboxusercontent.com');
    return url;
}

function isArabicWord(word) {
    const cleaned = word.replace(/[\s\u200B-\u200F\uFEFF\(\)\[\]\.،,]/g, '');
    if (!cleaned) return false;
    const arabicChars = (cleaned.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    return arabicChars / cleaned.length > 0.5;
}

function isCopticWord(word) {
    const cleaned = word.replace(/[\s\u200B-\u200F\uFEFF\(\)\[\]\.،,]/g, '');
    if (!cleaned) return false;
    const copticChars = (cleaned.match(/[\u2C80-\u2CFF\u03E2-\u03EF]/g) || []).length;
    if (copticChars > 0) return true;
    return /[ϥϩϫϭϯⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱⲻⲽⳁⳃⳅⳇⳉⳋⳍⳏⳑⳓⳕⳗⳙⳛⳝⳟⳡⳣ]/i.test(cleaned);
}

function formatCellContent(arabicWords, copticWords, wordType, wordOrigin) {
    const parts = [];
    if (arabicWords && arabicWords.length > 0) {
        parts.push(arabicWords.join('، '));
    }
    if (copticWords && copticWords.length > 0) {
        parts.push(copticWords.join('، '));
    }
    if (wordOrigin) {
        parts.push(wordOrigin);
    }
    if (wordType) {
        parts.push(wordType);
    }
    parts.push('.mp3');
    return parts.join('. ');
}

function parseCellFormatted(cellContent) {
    if (!cellContent) return null;
    
    let content = cellContent.trim();
    content = content.replace(/\.\s*mp3\s*$/i, '');
    
    const parts = content.split(/\s*\.\s*/).map(p => p.trim()).filter(Boolean);
    
    let arabicWords = [];
    let copticWords = [];
    let wordType = null;
    let wordOrigin = null;
    
    for (let part of parts) {
        // التحقق من النوع
        if (TYPE_WORDS.has(part)) {
            wordType = part;
        } 
        // التحقق من الأصل
        else if (ORIGIN_WORDS.has(part)) {
            wordOrigin = part;
        } 
        // التحقق من الكلمات القبطية
        else if (isCopticWord(part)) {
            copticWords.push(part);
        } 
        // معالجة الكلمات العربية (قد تكون مفصولة بفواصل)
        else if (part.includes('،') || part.includes(',')) {
            const subParts = part.split(/[،,]+/).map(p => p.trim()).filter(Boolean);
            arabicWords.push(...subParts);
        } 
        // كلمة عربية مفردة
        else if (isArabicWord(part)) {
            arabicWords.push(part);
        }
        // إذا كان الجزء لا ينتمي لأي تصنيف، نعتبره كلمة عربية
        else if (part.length > 0) {
            arabicWords.push(part);
        }
    }
    
    if (arabicWords.length === 0 && copticWords.length === 0) return null;
    
    return { arabicWords, copticWords, wordType, wordOrigin };
}

function reloadCoptocDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            console.warn('⚠️ coptic.xlsx غير موجود في data/');
            arabicToCoptic = {};
            copticToArabic = {};
            fullEntries = [];
            return false;
        }

        const XLSX = require('xlsx');
        const wb   = XLSX.readFile(DB_PATH);
        const ws   = wb.Sheets['sheet1'] || wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];

        if (!ws) { console.warn('⚠️ الورقة sheet1 غير موجودة'); return false; }

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const newArabicToCoptic = {};
        const newCopticToArabic = {};
        const newFullEntries = [];

        for (let i = 0; i < rows.length; i++) {
            const col1 = String(rows[i][0] || '').trim();
            const col2 = String(rows[i][1] || '').trim();
            if (!col1) continue;

            const audioUrl = col2 ? convertToDirectUrl(col2) : null;
            const parsed   = parseCellFormatted(col1);
            if (!parsed) continue;

            const { arabicWords, copticWords, wordType, wordOrigin } = parsed;
            
            const entry = { 
                id: Date.now() + '_' + i + '_' + Math.random(),
                originalCell: col1,
                arabics: arabicWords, 
                copticWords: copticWords,
                wordType: wordType || null, 
                wordOrigin: wordOrigin || null, 
                audioUrl 
            };
            
            newFullEntries.push(entry);

            for (const aw of arabicWords) {
                const trimmed = aw.trim();
                const withoutDiacritics = removeDiacritics(trimmed);
                const normalized = normalizeArabic(withoutDiacritics);
                newArabicToCoptic[trimmed] = entry;
                newArabicToCoptic[withoutDiacritics] = entry;
                newArabicToCoptic[normalized] = entry;
            }

            for (const cw of copticWords) {
                const trimmed = cw.trim();
                const lower = trimmed.toLowerCase();
                newCopticToArabic[trimmed] = entry;
                newCopticToArabic[lower] = entry;
            }
        }

        arabicToCoptic = newArabicToCoptic;
        copticToArabic = newCopticToArabic;
        fullEntries = newFullEntries;
        
        console.log(`✅ coptic.xlsx محمّل — ${fullEntries.length} مدخل | ${Object.keys(arabicToCoptic).length} عربي | ${Object.keys(copticToArabic).length} قبطي`);
        return true;

    } catch (err) {
        console.error('❌ خطأ في تحميل coptic.xlsx:', err.message);
        arabicToCoptic = {};
        copticToArabic = {};
        fullEntries = [];
        return false;
    }
}

function lookupCoptocWord(word) {
    const trimmed = word.trim();
    const withoutDiacritics = removeDiacritics(trimmed);
    const normalized = normalizeArabic(withoutDiacritics);
    const lower = trimmed.toLowerCase();

    if (arabicToCoptic[trimmed]) return { type: 'arabic', result: arabicToCoptic[trimmed], searchedWord: trimmed };
    if (arabicToCoptic[withoutDiacritics]) return { type: 'arabic', result: arabicToCoptic[withoutDiacritics], searchedWord: trimmed };
    if (arabicToCoptic[normalized]) return { type: 'arabic', result: arabicToCoptic[normalized], searchedWord: trimmed };
    if (arabicToCoptic[lower]) return { type: 'arabic', result: arabicToCoptic[lower], searchedWord: trimmed };
    
    if (copticToArabic[trimmed]) return { type: 'coptic', result: copticToArabic[trimmed], searchedWord: trimmed };
    if (copticToArabic[lower]) return { type: 'coptic', result: copticToArabic[lower], searchedWord: trimmed };

    for (const val of fullEntries) {
        if (val.arabics && val.arabics.some(a => {
            const normalizedA = normalizeArabic(removeDiacritics(a.toLowerCase()));
            return normalizedA === normalized;
        })) {
            return { type: 'arabic', result: val, searchedWord: trimmed };
        }
        if (val.copticWords && val.copticWords.some(c => c.toLowerCase() === lower)) {
            return { type: 'coptic', result: val, searchedWord: trimmed };
        }
    }

    return null;
}

function formatLookupResult(lookupResult) {
    if (!lookupResult) return null;
    
    const { type, result, searchedWord } = lookupResult;
    
    const formattedResult = {
        searchedWord: searchedWord,
        searchType: type,
        arabicMeanings: result.arabics || [],
        copticWords: result.copticWords || [],
        wordType: result.wordType || null,
        wordOrigin: result.wordOrigin || null,
        audioUrl: result.audioUrl || null,
        originalCell: result.originalCell || null
    };
    
    if (type === 'arabic') {
        formattedResult.arabicWord = searchedWord;
    }
    
    if (type === 'coptic') {
        formattedResult.copticWord = searchedWord;
    }
    
    return formattedResult;
}

function formatResultForDisplay(formattedResult) {
    if (!formattedResult) return '❌ لا توجد نتائج.';
    
    let resultText = '';
    
    // نوع البحث
    if (formattedResult.searchType === 'arabic') {
        resultText += `🔍 *البحث بالعربية:* ${formattedResult.searchedWord}\n\n`;
    } else {
        resultText += `🔍 *البحث بالقبطية:* ${formattedResult.searchedWord}\n\n`;
    }
    
    // المعاني العربية (الأهم)
    if (formattedResult.arabicMeanings && formattedResult.arabicMeanings.length > 0) {
        resultText += `📖 *المعنى/المعاني العربية:*\n`;
        resultText += `${formattedResult.arabicMeanings.join('، ')}\n\n`;
    } else {
        resultText += `⚠️ *لا توجد معاني عربية مسجلة*\n\n`;
    }
    
    // الكلمات القبطية
    if (formattedResult.copticWords && formattedResult.copticWords.length > 0) {
        resultText += `✝️ *الكلمة/الكلمات القبطية:*\n`;
        resultText += `${formattedResult.copticWords.join('، ')}\n\n`;
    }
    
    // النوع (مهم جداً)
    if (formattedResult.wordType && formattedResult.wordType !== 'null') {
        resultText += `🏷️ *النوع:* ${formattedResult.wordType}\n`;
    }
    
    // الأصل (مهم جداً)
    if (formattedResult.wordOrigin && formattedResult.wordOrigin !== 'null') {
        resultText += `🌍 *الأصل:* ${formattedResult.wordOrigin}\n`;
    }
    
    // رابط الصوت
    if (formattedResult.audioUrl) {
        resultText += `\n🔊 *رابط الصوت:*\n${formattedResult.audioUrl}`;
    }
    
    return resultText;
}

function addWordFormatted(fullCellContent, audioUrl) {
    if (!fullCellContent) return false;
    
    const parsed = parseCellFormatted(fullCellContent);
    if (!parsed) return false;
    
    const { arabicWords, copticWords, wordType, wordOrigin } = parsed;
    const directAudio = audioUrl ? convertToDirectUrl(audioUrl) : null;
    
    const entry = { 
        id: Date.now() + '_' + Math.random(),
        originalCell: fullCellContent,
        arabics: arabicWords, 
        copticWords: copticWords,
        wordType: wordType || null, 
        wordOrigin: wordOrigin || null, 
        audioUrl: directAudio 
    };
    
    fullEntries.push(entry);
    
    for (const aw of arabicWords) {
        const trimmed = aw.trim();
        const withoutDiacritics = removeDiacritics(trimmed);
        const normalized = normalizeArabic(withoutDiacritics);
        arabicToCoptic[trimmed] = entry;
        arabicToCoptic[withoutDiacritics] = entry;
        arabicToCoptic[normalized] = entry;
    }
    
    for (const cw of copticWords) {
        const trimmed = cw.trim();
        const lower = trimmed.toLowerCase();
        copticToArabic[trimmed] = entry;
        copticToArabic[lower] = entry;
    }
    
    return saveCoptocDb();
}

function addMultipleWordsFormatted(items) {
    let added = 0;
    let failed = 0;
    const errors = [];
    
    for (const item of items) {
        const { cellContent, audioUrl } = item;
        if (addWordFormatted(cellContent, audioUrl)) {
            added++;
        } else {
            failed++;
            errors.push(cellContent);
        }
    }
    
    return { added, failed, errors };
}

function deleteWordByCopticFull(copticWord) {
    const trimmed = copticWord.trim();
    const lower = trimmed.toLowerCase();
    
    let entryToDelete = null;
    
    if (copticToArabic[trimmed]) {
        entryToDelete = copticToArabic[trimmed];
    } else if (copticToArabic[lower]) {
        entryToDelete = copticToArabic[lower];
    }
    
    if (!entryToDelete) return false;
    
    const entryIndex = fullEntries.findIndex(e => e.id === entryToDelete.id);
    if (entryIndex !== -1) {
        fullEntries.splice(entryIndex, 1);
    }
    
    const keysToDelete = [];
    for (const [key, value] of Object.entries(arabicToCoptic)) {
        if (value === entryToDelete) {
            keysToDelete.push(key);
        }
    }
    for (const key of keysToDelete) {
        delete arabicToCoptic[key];
    }
    
    const copticKeysToDelete = [];
    for (const [key, value] of Object.entries(copticToArabic)) {
        if (value === entryToDelete) {
            copticKeysToDelete.push(key);
        }
    }
    for (const key of copticKeysToDelete) {
        delete copticToArabic[key];
    }
    
    return saveCoptocDb();
}

function deleteMultipleWordsByCoptic(copticWordsList) {
    let deleted = 0;
    let notFound = 0;
    const notFoundWords = [];
    
    for (const word of copticWordsList) {
        if (deleteWordByCopticFull(word)) {
            deleted++;
        } else {
            notFound++;
            notFoundWords.push(word);
        }
    }
    
    return { deleted, notFound, notFoundWords };
}

function updateWord(copticWord, newCellContent, newAudioUrl) {
    const trimmed = copticWord.trim();
    const lower = trimmed.toLowerCase();
    
    let entryToUpdate = null;
    
    if (copticToArabic[trimmed]) {
        entryToUpdate = copticToArabic[trimmed];
    } else if (copticToArabic[lower]) {
        entryToUpdate = copticToArabic[lower];
    }
    
    if (!entryToUpdate) return false;
    
    const oldId = entryToUpdate.id;
    const entryIndex = fullEntries.findIndex(e => e.id === oldId);
    
    const keysToDelete = [];
    for (const [key, value] of Object.entries(arabicToCoptic)) {
        if (value === entryToUpdate) {
            keysToDelete.push(key);
        }
    }
    for (const key of keysToDelete) {
        delete arabicToCoptic[key];
    }
    
    const copticKeysToDelete = [];
    for (const [key, value] of Object.entries(copticToArabic)) {
        if (value === entryToUpdate) {
            copticKeysToDelete.push(key);
        }
    }
    for (const key of copticKeysToDelete) {
        delete copticToArabic[key];
    }
    
    if (entryIndex !== -1) {
        fullEntries.splice(entryIndex, 1);
    }
    
    const parsed = parseCellFormatted(newCellContent);
    if (!parsed) return false;
    
    const { arabicWords, copticWords, wordType, wordOrigin } = parsed;
    const directAudio = newAudioUrl ? convertToDirectUrl(newAudioUrl) : null;
    
    const newEntry = { 
        id: Date.now() + '_' + Math.random(),
        originalCell: newCellContent,
        arabics: arabicWords, 
        copticWords: copticWords,
        wordType: wordType || null, 
        wordOrigin: wordOrigin || null, 
        audioUrl: directAudio 
    };
    
    fullEntries.push(newEntry);
    
    for (const aw of arabicWords) {
        const trimmedAw = aw.trim();
        const withoutDiacritics = removeDiacritics(trimmedAw);
        const normalized = normalizeArabic(withoutDiacritics);
        arabicToCoptic[trimmedAw] = newEntry;
        arabicToCoptic[withoutDiacritics] = newEntry;
        arabicToCoptic[normalized] = newEntry;
    }
    
    for (const cw of copticWords) {
        const trimmedCw = cw.trim();
        const lowerCw = trimmedCw.toLowerCase();
        copticToArabic[trimmedCw] = newEntry;
        copticToArabic[lowerCw] = newEntry;
    }
    
    return saveCoptocDb();
}

function saveCoptocDb() {
    try {
        const XLSX = require('xlsx');
        const rows = [];
        
        for (const entry of fullEntries) {
            rows.push([entry.originalCell, entry.audioUrl || '']);
        }
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 80 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
        XLSX.writeFile(wb, DB_PATH);
        return true;
    } catch (err) {
        console.error('❌ خطأ في حفظ coptic.xlsx:', err.message);
        return false;
    }
}

function exportCoptocXlsx() {
    try {
        const XLSX = require('xlsx');
        const rows = [['الكلمات', 'رابط الصوت']];
        
        for (const entry of fullEntries) {
            rows.push([entry.originalCell, entry.audioUrl || '']);
        }
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 80 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (e) {
        console.error('❌ فشل تصدير coptocDb xlsx:', e.message);
        return null;
    }
}

function coptocSize() {
    return fullEntries.length;
}

function getAllEntries() {
    return fullEntries;
}

function findEntryByCoptic(copticWord) {
    const trimmed = copticWord.trim();
    const lower = trimmed.toLowerCase();
    
    if (copticToArabic[trimmed]) return copticToArabic[trimmed];
    if (copticToArabic[lower]) return copticToArabic[lower];
    
    return fullEntries.find(e => 
        e.copticWords && e.copticWords.some(c => c.toLowerCase() === lower)
    ) || null;
}

reloadCoptocDb();

module.exports = { 
    reloadCoptocDb, 
    lookupCoptocWord, 
    formatLookupResult,
    formatResultForDisplay,
    addWordFormatted,
    addMultipleWordsFormatted,
    deleteWordByCopticFull,
    deleteMultipleWordsByCoptic,
    updateWord,
    exportCoptocXlsx, 
    coptocSize,
    getAllEntries,
    findEntryByCoptic,
    convertToDirectUrl,
    formatCellContent,
    parseCellFormatted
};