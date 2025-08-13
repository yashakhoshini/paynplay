// Universal Google Sheets Schema Mapper
// Handles arbitrary sheet layouts by inferring column mappings
// Header normalization and synonym patterns
const HEADER_PATTERNS = {
    transactionType: [
        /transaction.?type/i,
        /type/i,
        /txn.?type/i,
        /category/i,
        /action/i
    ],
    amount: [
        /amount/i,
        /amt/i,
        /sum/i,
        /total/i,
        /value/i,
        /money/i
    ],
    paymentMethod: [
        /payment.?method/i,
        /method/i,
        /pay.?method/i,
        /transfer.?type/i,
        /platform/i
    ],
    status: [
        /status/i,
        /state/i,
        /condition/i,
        /progress/i
    ],
    receiver: [
        /receiver.?handle/i,
        /receiver/i,
        /payee/i,
        /handle/i,
        /recipient/i,
        /to/i,
        /send.?to/i
    ],
    username: [
        /username/i,
        /user/i,
        /name/i,
        /player/i,
        /member/i,
        /from/i
    ],
    timestamp: [
        /timestamp/i,
        /date/i,
        /time/i,
        /created/i,
        /updated/i,
        /when/i
    ],
    id: [
        /id/i,
        /transaction.?id/i,
        /txn.?id/i,
        /reference/i,
        /ref/i
    ],
    priority: [
        /priority/i,
        /urgent/i,
        /fast/i,
        /type/i
    ],
    verifiedBy: [
        /verified.?by/i,
        /confirmed.?by/i,
        /approved.?by/i,
        /loader/i,
        /owner/i
    ],
    verifiedAt: [
        /verified.?at/i,
        /confirmed.?at/i,
        /approved.?at/i,
        /completed.?at/i
    ]
};
function normalizeHeader(header) {
    return header.trim().toLowerCase().replace(/[^\w\s]/g, '');
}
function matchesPattern(header, patterns) {
    const normalized = normalizeHeader(header);
    return patterns.some(pattern => pattern.test(normalized));
}
function scoreColumn(header, values, columnType) {
    let score = 0;
    const normalizedHeader = normalizeHeader(header);
    // Header pattern matching (highest weight)
    if (matchesPattern(header, HEADER_PATTERNS[columnType])) {
        score += 100;
    }
    // Value profiling based on column type
    const nonEmptyValues = values.filter(v => v !== null && v !== undefined && v !== '');
    switch (columnType) {
        case 'amount':
            // Check if values look like numbers/currency
            const numericCount = nonEmptyValues.filter(v => {
                const str = String(v);
                return /^\d+(\.\d+)?$/.test(str) || /^\$?\d+(\.\d+)?$/.test(str);
            }).length;
            score += (numericCount / nonEmptyValues.length) * 50;
            break;
        case 'paymentMethod':
            // Check for common payment methods
            const methodCount = nonEmptyValues.filter(v => {
                const str = String(v).toUpperCase();
                return /ZELLE|VENMO|CASHAPP|PAYPAL|BANK|TRANSFER/i.test(str);
            }).length;
            score += (methodCount / nonEmptyValues.length) * 30;
            break;
        case 'status':
            // Check for common status values
            const statusCount = nonEmptyValues.filter(v => {
                const str = String(v).toLowerCase();
                return /pending|paid|completed|matched|cancelled|open/i.test(str);
            }).length;
            score += (statusCount / nonEmptyValues.length) * 40;
            break;
        case 'timestamp':
            // Check for date-like values
            const dateCount = nonEmptyValues.filter(v => {
                const str = String(v);
                return /^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(str);
            }).length;
            score += (dateCount / nonEmptyValues.length) * 60;
            break;
        case 'username':
            // Check for username-like patterns (alphanumeric, often with @)
            const usernameCount = nonEmptyValues.filter(v => {
                const str = String(v);
                return /^[a-zA-Z0-9_]+$/.test(str) || str.startsWith('@');
            }).length;
            score += (usernameCount / nonEmptyValues.length) * 25;
            break;
    }
    return score;
}
export function inferMapping(headers, sampleData) {
    const cols = {};
    let totalScore = 0;
    let maxPossibleScore = 0;
    // Score each column for each type
    const columnScores = [];
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const header = headers[colIndex];
        const values = sampleData.map(row => row[colIndex]).filter(v => v !== undefined);
        for (const [type, patterns] of Object.entries(HEADER_PATTERNS)) {
            const score = scoreColumn(header, values, type);
            if (score > 0) {
                columnScores.push({ colIndex, type: type, score });
            }
        }
    }
    // Sort by score and assign best matches
    columnScores.sort((a, b) => b.score - a.score);
    for (const { colIndex, type, score } of columnScores) {
        if (!cols[type]) {
            cols[type] = colIndex;
            totalScore += score;
        }
    }
    // Calculate confidence based on how many key columns we found
    const keyColumns = ['transactionType', 'amount', 'paymentMethod', 'status'];
    const foundKeyColumns = keyColumns.filter(key => cols[key] !== undefined).length;
    const confidence = Math.min(100, (foundKeyColumns / keyColumns.length) * 100 + (totalScore / 100));
    return {
        sheetTitle: 'Inferred',
        headerRow: 1,
        cols,
        confidence: Math.round(confidence)
    };
}
export function buildCanonicalRows(data, mapping, startRow = 1) {
    const rows = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowIndex = startRow + i + 1; // 1-based
        const canonical = { rowIndex };
        // Map each column based on the inferred mapping
        for (const [type, colIndex] of Object.entries(mapping.cols)) {
            if (colIndex !== undefined && row[colIndex] !== undefined) {
                const value = row[colIndex];
                switch (type) {
                    case 'amount':
                        // Convert to number, handling currency symbols
                        const numValue = typeof value === 'number' ? value :
                            Number(String(value).replace(/[$,]/g, ''));
                        if (!isNaN(numValue)) {
                            canonical.amount = numValue;
                        }
                        break;
                    case 'paymentMethod':
                        canonical.paymentMethod = String(value).trim().toUpperCase();
                        break;
                    case 'status':
                        canonical.status = String(value).trim().toLowerCase();
                        break;
                    case 'transactionType':
                        canonical.transactionType = String(value).trim().toLowerCase();
                        break;
                    case 'receiver':
                        canonical.receiver = String(value).trim();
                        break;
                    case 'username':
                        canonical.username = String(value).trim();
                        break;
                    case 'timestamp':
                        canonical.timestamp = String(value);
                        break;
                    case 'id':
                        canonical.id = String(value);
                        break;
                    case 'priority':
                        canonical.priority = String(value).trim().toLowerCase();
                        break;
                    case 'verifiedBy':
                        canonical.verifiedBy = String(value);
                        break;
                    case 'verifiedAt':
                        canonical.verifiedAt = String(value);
                        break;
                }
            }
        }
        rows.push(canonical);
    }
    return rows;
}
// Helper function to normalize payment methods
export function normalizeMethod(method) {
    const normalized = method.trim().toUpperCase();
    if (normalized === 'ZELLE')
        return 'ZELLE';
    if (normalized === 'VENMO')
        return 'VENMO';
    if (normalized === 'CASHAPP' || normalized === 'CASH APP')
        return 'CASHAPP';
    if (normalized === 'PAYPAL')
        return 'PAYPAL';
    if (normalized === 'CASH')
        return ''; // Exclude CASH method
    if (normalized === 'BANK TRANSFER' || normalized === 'BANKTRANSFER')
        return ''; // Exclude Bank Transfer method
    return normalized; // pass-through for other custom methods
}
// Helper function to check if a row represents an open cashout
export function isOpenCashout(row) {
    const type = row.transactionType || '';
    const status = row.status || '';
    // Check if it's a cashout transaction
    const isCashout = /cash.?out/.test(type);
    // Check if it's pending/open
    const isPending = !status || /pending|open|awaiting/i.test(status);
    return isCashout && isPending;
}
