import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, PDFDownloadLink } from '@react-pdf/renderer';
// Import Base64 encoded font to avoid URL/CORS/MIME issues
import NotoSansJP from '../../fonts/NotoSansJP.js';

// Register Japanese Font
Font.register({
    family: 'NotoSansJP',
    src: NotoSansJP,
});

// Shared Column Widths
// Journal: 12 + 18 + 12 + 18 + 12 + 28 = 100%
const JOURNAL_WIDTHS = {
    date: '12%',
    account: '18%',
    amount: '12%',
    desc: '28%', // Increased to fill gap
};

// Ledger: 12 + 18 + 34 + 12 + 12 + 12 = 100%
const LEDGER_WIDTHS = {
    date: '12%',
    account: '18%',
    desc: '34%', // Increased significantly to fill gap
    amount: '12%',
    bal: '12%',
};

// Styles - Professional Grid Layout
const styles = StyleSheet.create({
    page: {
        paddingTop: 30,
        paddingBottom: 40,
        paddingHorizontal: 30,
        fontFamily: 'NotoSansJP',
        fontSize: 9,
        flexDirection: 'column',
    },
    header: {
        marginBottom: 10,
        paddingBottom: 5,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    subHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
        fontSize: 9,
    },

    // Grid Strategy
    tableContainer: {
        display: 'flex',
        flexDirection: 'column',
        borderTopWidth: 0.5,
        borderLeftWidth: 0.5,
        borderColor: '#000000',
    },

    // Rows
    rowGroup: {
        borderBottomWidth: 0,
    },
    tableRow: {
        flexDirection: 'row',
        minHeight: 18,
        alignItems: 'stretch',
    },
    headerRow: {
        backgroundColor: '#f0f0f0',
    },
    stripedRow: {
        backgroundColor: '#fafafa',
    },

    // Cells
    cell: {
        borderRightWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: '#000000',
        paddingVertical: 2,
        paddingHorizontal: 4,
        fontSize: 9,
    },
    headerCell: {
        fontWeight: 'bold',
        fontSize: 10,
        textAlign: 'center',
        paddingVertical: 4,
    },

    // Column Styles (Journal Defaults)
    colDate: { width: JOURNAL_WIDTHS.date, textAlign: 'center' },
    colAccount: { width: JOURNAL_WIDTHS.account, textAlign: 'left' },
    colAmount: { width: JOURNAL_WIDTHS.amount, textAlign: 'right' },
    colDesc: { width: JOURNAL_WIDTHS.desc, textAlign: 'left' },

    // Ledger Overrides
    colLedgerDesc: { width: LEDGER_WIDTHS.desc, textAlign: 'left' },
    colBal: { width: LEDGER_WIDTHS.bal, textAlign: 'right' },

    pageNumber: {
        position: 'absolute',
        fontSize: 8,
        bottom: 20,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#444',
    },
});

// Format currency
const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || amount === '') return '';
    return new Intl.NumberFormat('ja-JP').format(amount);
};

// Common Report Header
const ReportHeader = ({ title, ownerName, period, createdDate, address, invoiceNumber }) => (
    <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.subHeader}>
            <Text>事業主: {ownerName}</Text>
            {/* Optional Additional Info */}
            <Text>期間: {period}</Text>
        </View>
        {/* Extended Info Row */}
        {(invoiceNumber || address) && (
            <View style={{ marginBottom: 4 }}>
                {invoiceNumber ? <Text style={{ fontSize: 8 }}>登録番号: {invoiceNumber}</Text> : null}
                {address ? <Text style={{ fontSize: 8 }}>住所: {address}</Text> : null}
            </View>
        )}
        <View style={styles.subHeader}>
            <Text>作成日: {createdDate}</Text>
        </View>
    </View>
);

// Journal Document (仕訳帳)
const JournalDocument = ({ data = [], ownerName, period, createdDate, address, invoiceNumber }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <ReportHeader
                title="仕訳帳 (Journal)"
                ownerName={ownerName}
                period={period}
                createdDate={createdDate}
                address={address}
                invoiceNumber={invoiceNumber}
            />

            <View style={styles.tableContainer}>
                {/* Header Row */}
                <View style={[styles.tableRow, styles.headerRow]} fixed>
                    <Text style={[styles.cell, styles.colDate, styles.headerCell]}>日付</Text>
                    <Text style={[styles.cell, styles.colAccount, styles.headerCell]}>借方科目</Text>
                    <Text style={[styles.cell, styles.colAmount, styles.headerCell]}>借方金額</Text>
                    <Text style={[styles.cell, styles.colAccount, styles.headerCell]}>貸方科目</Text>
                    <Text style={[styles.cell, styles.colAmount, styles.headerCell]}>貸方金額</Text>
                    <Text style={[styles.cell, styles.colDesc, styles.headerCell]}>摘要</Text>
                </View>

                {/* Data Rows */}
                {data.map((group, groupIndex) => (
                    <View key={groupIndex} wrap={false} style={styles.rowGroup}>
                        {group.map((row, rowIndex) => (
                            <View key={rowIndex} style={[styles.tableRow]}>
                                <Text style={[styles.cell, styles.colDate]}>{rowIndex === 0 ? row.date : ''}</Text>
                                <Text style={[styles.cell, styles.colAccount]}>{row.debitAccount}</Text>
                                <Text style={[styles.cell, styles.colAmount]}>{formatCurrency(row.debitAmount)}</Text>
                                <Text style={[styles.cell, styles.colAccount]}>{row.creditAccount}</Text>
                                <Text style={[styles.cell, styles.colAmount]}>{formatCurrency(row.creditAmount)}</Text>
                                <Text style={[styles.cell, styles.colDesc]}>{row.description}</Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>

            <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
                `Page ${pageNumber} of ${totalPages}`
            )} fixed />
        </Page>
    </Document>
);

// General Ledger Document (総勘定元帳)
const GeneralLedgerDocument = ({ accountName, data = [], initialBalance, ownerName, period, createdDate, address, phone, invoiceNumber, accountType }) => {
    // Calculate running balance
    let currentBalance = initialBalance || 0;

    const processedGroups = data.map(group => {
        return group.map(row => {
            const debitVal = Number(row.debitAmount) || 0;
            const creditVal = Number(row.creditAmount) || 0;

            // Dynamic Balance Logic
            if (accountType === 'credit_balance') {
                // Revenue/Liability: Credit increases balance
                currentBalance += (creditVal - debitVal);
            } else {
                // Asset/Expense: Debit increases balance (Default)
                currentBalance += (debitVal - creditVal);
            }

            return {
                ...row,
                balance: currentBalance
            };
        });
    });

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <ReportHeader
                    title={`総勘定元帳: ${accountName}`}
                    ownerName={ownerName}
                    period={period}
                    createdDate={createdDate}
                    address={address}
                    invoiceNumber={invoiceNumber}
                />

                <View style={styles.tableContainer}>
                    {/* Header Row */}
                    <View style={[styles.tableRow, styles.headerRow]} fixed>
                        <Text style={[styles.cell, styles.colDate, styles.headerCell]}>日付</Text>
                        <Text style={[styles.cell, styles.colAccount, styles.headerCell]}>相手勘定</Text>
                        <Text style={[styles.cell, styles.colLedgerDesc, styles.headerCell]}>摘要</Text>
                        <Text style={[styles.cell, styles.colAmount, styles.headerCell]}>借方金額</Text>
                        <Text style={[styles.cell, styles.colAmount, styles.headerCell]}>貸方金額</Text>
                        <Text style={[styles.cell, styles.colBal, styles.headerCell]}>差引残高</Text>
                    </View>

                    {/* Initial Balance */}
                    <View style={styles.tableRow}>
                        <Text style={[styles.cell, styles.colDate]}>-</Text>
                        <Text style={[styles.cell, styles.colAccount]}>(期首残高)</Text>
                        <Text style={[styles.cell, styles.colLedgerDesc]}>-</Text>
                        <Text style={[styles.cell, styles.colAmount]}>-</Text>
                        <Text style={[styles.cell, styles.colAmount]}>-</Text>
                        <Text style={[styles.cell, styles.colBal]}>{formatCurrency(initialBalance || 0)}</Text>
                    </View>

                    {/* Rows */}
                    {processedGroups.map((group, groupIndex) => (
                        <View key={groupIndex} wrap={false} style={styles.rowGroup}>
                            {group.map((row, rowIndex) => (
                                <View key={rowIndex} style={[styles.tableRow]}>
                                    <Text style={[styles.cell, styles.colDate]}>{row.date}</Text>
                                    <Text style={[styles.cell, styles.colAccount]}>{row.counterAccount}</Text>
                                    <Text style={[styles.cell, styles.colLedgerDesc]}>{row.description}</Text>
                                    <Text style={[styles.cell, styles.colAmount]}>{formatCurrency(row.debitAmount > 0 ? row.debitAmount : '')}</Text>
                                    <Text style={[styles.cell, styles.colAmount]}>{formatCurrency(row.creditAmount > 0 ? row.creditAmount : '')}</Text>
                                    <Text style={[styles.cell, styles.colBal]}>{formatCurrency(row.balance)}</Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>

                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
                    `Page ${pageNumber} of ${totalPages}`
                )} fixed />
            </Page>
        </Document>
    );
};

// Inventory Sheet Document (棚卸表)
const InventoryDocument = ({ data = [], ownerName, period, createdDate, address, invoiceNumber, snapshotDate, totalValuation }) => {
    // Columns: Name (40%), Source (10%), Qty (10%), Unit Cost (20%), Total (20%)
    const invStyles = StyleSheet.create({
        colName: { width: '40%', textAlign: 'left' },
        colSource: { width: '10%', textAlign: 'center' },
        colQty: { width: '10%', textAlign: 'center' },
        colCost: { width: '20%', textAlign: 'right' },
        colTotal: { width: '20%', textAlign: 'right' },
    });

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <ReportHeader
                    title="棚卸表 (Inventory Sheet)"
                    ownerName={ownerName}
                    period={`棚卸日: ${snapshotDate}`}
                    createdDate={createdDate}
                    address={address}
                    invoiceNumber={invoiceNumber}
                />

                <View style={styles.tableContainer}>
                    {/* Header Row */}
                    <View style={[styles.tableRow, styles.headerRow]} fixed>
                        <Text style={[styles.cell, invStyles.colName, styles.headerCell]}>商品名 / 品目</Text>
                        <Text style={[styles.cell, invStyles.colSource, styles.headerCell]}>区分</Text>
                        <Text style={[styles.cell, invStyles.colQty, styles.headerCell]}>数量</Text>
                        <Text style={[styles.cell, invStyles.colCost, styles.headerCell]}>単価</Text>
                        <Text style={[styles.cell, invStyles.colTotal, styles.headerCell]}>金額</Text>
                    </View>

                    {/* Rows */}
                    {data.map((item, index) => (
                        <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.stripedRow : {}]} wrap={false}>
                            <Text style={[styles.cell, invStyles.colName]}>{item.name}</Text>
                            <Text style={[styles.cell, invStyles.colSource]}>{item.source_type}</Text>
                            <Text style={[styles.cell, invStyles.colQty]}>{item.quantity}</Text>
                            <Text style={[styles.cell, invStyles.colCost]}>{formatCurrency(item.cost_price)}</Text>
                            <Text style={[styles.cell, invStyles.colTotal]}>{formatCurrency(item.quantity * item.cost_price)}</Text>
                        </View>
                    ))}

                    {/* Footer Row (Grand Total) */}
                    <View style={[styles.tableRow, { borderTopWidth: 1 }]}>
                        <Text style={[styles.cell, invStyles.colName, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, invStyles.colSource, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, invStyles.colQty, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, invStyles.colCost, { fontWeight: 'bold', textAlign: 'right' }]}>期末商品棚卸高:</Text>
                        <Text style={[styles.cell, invStyles.colTotal, { fontWeight: 'bold' }]}>{formatCurrency(totalValuation)}</Text>
                    </View>
                </View>

                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
                    `Page ${pageNumber} of ${totalPages}`
                )} fixed />
            </Page>
        </Document>
    );
};

// Depreciation Logic (Straight-Line & One-Time)
// Depreciation Logic (Straight-Line & One-Time)
const calculateDepreciation = (cost, life, acquiredDate, method, businessRatio = 100) => {
    let fullExpense = 0;
    const costVal = Number(cost);

    // 1. Calculate Full Expense
    if (method === 'ONE_TIME') {
        fullExpense = costVal;
    } else {
        const lifeVal = Number(life);
        const acquired = new Date(acquiredDate);
        const today = new Date();
        const currentYear = today.getFullYear();
        const acquiredYear = acquired.getFullYear();

        // Yearly Depreciation (Full Year)
        const yearlyDepreciation = Math.floor(costVal / lifeVal);

        let monthsUsed = 12;
        if (acquiredYear === currentYear) {
            // Acquired this year: months used including acquisition month
            const startMonth = acquired.getMonth() + 1;
            monthsUsed = 13 - startMonth;
        } else if (acquiredYear > currentYear) {
            // Future asset
            return { currentExpense: 0, allowableExpense: 0, bookValue: costVal };
        }

        // Current Expense (Prorated)
        fullExpense = Math.floor(yearlyDepreciation * (monthsUsed / 12));

        // Past Depreciation
        let pastYears = currentYear - acquiredYear;
        if (acquiredYear === currentYear) pastYears = 0;
        const pastDepreciation = (pastYears > 0) ? (yearlyDepreciation * pastYears) : 0;

        // Cap Amount (Max Depreciable = Cost - 1)
        const maxDepreciable = costVal - 1;
        const totalAccumulated = pastDepreciation + fullExpense;

        if (totalAccumulated > maxDepreciable) {
            fullExpense = maxDepreciable - pastDepreciation;
            if (fullExpense < 0) fullExpense = 0;
        }
    }

    // 2. Apply Business Ratio
    const ratio = Number(businessRatio) / 100;
    const allowableExpense = Math.floor(fullExpense * ratio);

    // 3. Calculate Book Value
    // Note: Book value is reduced by the FULL expense because the asset depreciates physically/legally regardless of business use percentage.
    // However, for tax purposes, "Book Value" usually tracks the "Basis".
    // If we assume Straight Line for the Life of the asset:
    // Book Value = Cost - (All Past Full Expenses + Current Full Expense)

    // We need to re-estimate Past Expenses to get Book Value
    let pastDepTotal = 0;
    if (method !== 'ONE_TIME') {
        const acquired = new Date(acquiredDate);
        const currentYear = new Date().getFullYear();
        const acquiredYear = acquired.getFullYear();
        const lifeVal = Number(life);

        if (acquiredYear < currentYear) {
            const yearlyDep = Math.floor(costVal / lifeVal);
            pastDepTotal = yearlyDep * (currentYear - acquiredYear);
        }
    }

    // This is an approximation since we don't store "Accumulated Depreciation" in DB.
    // For ONE_TIME, Book Value is 0 (or 1 depending on rule, usually 0 for immediate expensing? No, 1 yen is for Memo).
    // Actually Special Depreciation (One Time) usually leaves 1 yen?
    // Let's assume 1 yen minimum for everything.

    const accumulatedIncludingThisYear = pastDepTotal + fullExpense;
    let bookValue = costVal - accumulatedIncludingThisYear;

    if (method === 'ONE_TIME') {
        // If it was One Time, it's fully expensed in year 1.
        // If this is year 1, fullExpense is Cost. Book Value becomes 0.
        // Let's enforce 1 yen memo.
        // But if ONE_TIME was used in previous year, we need to know that. 
        // Our 'create_item' sets 'current_book_value' but we are calculating on the fly here.
        // If Method is ONE_TIME and acquiredYear < currentYear, Book Value is 1.
        const acquiredYear = new Date(acquiredDate).getFullYear();
        if (acquiredYear < new Date().getFullYear()) {
            bookValue = 0;
        }
    }

    return {
        currentExpense: fullExpense,
        allowableExpense: allowableExpense,
        bookValue: Math.max(1, bookValue)
    };
};

const FixedAssetsDocument = ({ data = [], ownerName, period, createdDate, address, invoiceNumber }) => {
    // Columns: Name, Date, Cost, Method, Life, Ratio, Full Exp, Allowable Exp, Book Value
    const stylesFA = StyleSheet.create({
        colName: { width: '20%', textAlign: 'left' },
        colDate: { width: '10%', textAlign: 'center' },
        colCost: { width: '12%', textAlign: 'right' },
        colMethod: { width: '8%', textAlign: 'center' },
        colLife: { width: '5%', textAlign: 'center' },
        colRatio: { width: '5%', textAlign: 'center' },
        colFullExp: { width: '13%', textAlign: 'right', fontSize: 8, color: '#666' },
        colAllowExp: { width: '13%', textAlign: 'right', fontWeight: 'bold' },
        colBook: { width: '14%', textAlign: 'right' },
    });

    // Pre-calculate totals
    let totalFullExpense = 0;
    let totalAllowableExpense = 0;
    let totalBookValue = 0;

    const processedData = data.map(item => {
        const calc = calculateDepreciation(item.purchase_price, item.lifespan_years, item.purchase_date, item.method, item.business_ratio || 100);
        totalFullExpense += calc.currentExpense;
        totalAllowableExpense += calc.allowableExpense;
        totalBookValue += calc.bookValue;
        return { ...item, ...calc };
    });

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={[styles.page, { paddingHorizontal: 20 }]}>
                <ReportHeader
                    title="固定資産台帳 (Fixed Assets Ledger)"
                    ownerName={ownerName}
                    period={period}
                    createdDate={createdDate}
                    address={address}
                    invoiceNumber={invoiceNumber}
                />

                <View style={styles.tableContainer}>
                    {/* Header Row */}
                    <View style={[styles.tableRow, styles.headerRow]} fixed>
                        <Text style={[styles.cell, stylesFA.colName, styles.headerCell]}>資産の名称</Text>
                        <Text style={[styles.cell, stylesFA.colDate, styles.headerCell]}>取得日</Text>
                        <Text style={[styles.cell, stylesFA.colCost, styles.headerCell]}>取得価額</Text>
                        <Text style={[styles.cell, stylesFA.colMethod, styles.headerCell]}>償却</Text>
                        <Text style={[styles.cell, stylesFA.colLife, styles.headerCell]}>耐用</Text>
                        <Text style={[styles.cell, stylesFA.colRatio, styles.headerCell]}>割合</Text>
                        <Text style={[styles.cell, stylesFA.colFullExp, styles.headerCell]}>本年分償却費</Text>
                        <Text style={[styles.cell, stylesFA.colAllowExp, styles.headerCell]}>繰入額 (経費)</Text>
                        <Text style={[styles.cell, stylesFA.colBook, styles.headerCell]}>期末帳簿価額</Text>
                    </View>

                    {/* Rows */}
                    {processedData.map((item, index) => (
                        <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.stripedRow : {}]} wrap={false}>
                            <Text style={[styles.cell, stylesFA.colName]}>{item.name}</Text>
                            <Text style={[styles.cell, stylesFA.colDate]}>{item.purchase_date}</Text>
                            <Text style={[styles.cell, stylesFA.colCost]}>{formatCurrency(item.purchase_price)}</Text>
                            <Text style={[styles.cell, stylesFA.colMethod]}>{item.method === 'ONE_TIME' ? '即時' : '定額'}</Text>
                            <Text style={[styles.cell, stylesFA.colLife]}>{item.lifespan_years}</Text>
                            <Text style={[styles.cell, stylesFA.colRatio]}>{item.business_ratio || 100}%</Text>
                            <Text style={[styles.cell, stylesFA.colFullExp]}>{formatCurrency(item.currentExpense)}</Text>
                            <Text style={[styles.cell, stylesFA.colAllowExp]}>{formatCurrency(item.allowableExpense)}</Text>
                            <Text style={[styles.cell, stylesFA.colBook]}>{formatCurrency(item.bookValue)}</Text>
                        </View>
                    ))}

                    {/* Footer Row */}
                    <View style={[styles.tableRow, { borderTopWidth: 1 }]}>
                        <Text style={[styles.cell, stylesFA.colName, { borderRightWidth: 0 }]}>合計 (Total)</Text>
                        <Text style={[styles.cell, stylesFA.colDate, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, stylesFA.colCost, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, stylesFA.colMethod, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, stylesFA.colLife, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, stylesFA.colRatio, { borderRightWidth: 0 }]}></Text>
                        <Text style={[styles.cell, stylesFA.colFullExp, { fontWeight: 'bold' }]}>{formatCurrency(totalFullExpense)}</Text>
                        <Text style={[styles.cell, stylesFA.colAllowExp, { fontWeight: 'bold' }]}>{formatCurrency(totalAllowableExpense)}</Text>
                        <Text style={[styles.cell, stylesFA.colBook, { fontWeight: 'bold' }]}>{formatCurrency(totalBookValue)}</Text>
                    </View>
                </View>

                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
                    `Page ${pageNumber} of ${totalPages}`
                )} fixed />
            </Page>
        </Document>
    );
};

// Main Export Button Component
export const AccountingPDFButton = ({ type, data, config, buttonLabel = 'PDF出力' }) => {
    // config: { entityName, period, createdDate, accountName (for ledger), initialBalance (for ledger) }
    const now = new Date();

    // Dynamic Filename Generation: Journal_YYYYMMDD_HHMMSS.pdf
    const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS

    // Use window.breederAccountingSettings.settings as the source of truth for Owner Info
    const globalSettings = window.breederAccountingSettings?.settings || {};

    const ownerName = config?.ownerName || globalSettings.entityName || config?.entityName || '事業主';

    const safeConfig = {
        ownerName: ownerName,
        period: 'YYYY/MM/DD - YYYY/MM/DD',
        createdDate: now.toLocaleDateString('ja-JP'),
        address: globalSettings.address || '',
        phone: globalSettings.phone || '',
        invoiceNumber: globalSettings.invoiceNumber || '',
        ...config
    };

    let doc;
    let fileName = `report_${timestamp}.pdf`;

    if (type === 'journal') {
        doc = <JournalDocument data={data} {...safeConfig} />;
        fileName = `Journal_${timestamp}.pdf`;
    } else if (type === 'ledger') {
        doc = <GeneralLedgerDocument data={data} {...safeConfig} />;
        const safeAccountName = (config?.accountName || 'all').replace(/\s+/g, '_');
        fileName = `Ledger_${safeAccountName}_${timestamp}.pdf`;
    } else if (type === 'inventory') {
        doc = <InventoryDocument data={data} {...safeConfig} />;
        fileName = `Inventory_${config?.snapshotDate}_${timestamp}.pdf`;
    } else if (type === 'assets') {
        doc = <FixedAssetsDocument data={data} {...safeConfig} />;
        fileName = `AssetsLedger_${timestamp}.pdf`;
    } else {
        return null;
    }

    // ... (rest)
    // Debugging Info (Hidden unless error)
    const [debugError, setDebugError] = React.useState(null);

    return (
        <div>
            <PDFDownloadLink document={doc} fileName={fileName}>
                {({ blob, url, loading, error }) => {
                    if (error) {
                        // Capture error for display
                        if (!debugError) setDebugError(error);
                        console.error('PDF Generation Error:', error);
                        return <button className="button button-link-delete">PDF Generation Failed</button>;
                    }
                    return loading ? 'Preparing PDF...' : <button className="button button-secondary">{buttonLabel}</button>;
                }}
            </PDFDownloadLink>

            {(debugError) && (
                <div style={{ marginTop: '10px', padding: '10px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '11px' }}>
                    <strong>Debug Info:</strong><br />
                    Error: {debugError.message || debugError.toString()}<br />
                </div>
            )}
        </div>
    );
};


// e-Tax CSV Button Component
export const ETaxCSVButton = ({ year, type = 'PL', label = 'e-Tax CSV出力' }) => {
    const handleDownload = () => {
        const settings = window.breederAccountingSettings;
        if (!settings) return;

        const url = `${settings.root}breeder/v1/etax/export?year=${year}&type=${type}&_wpnonce=${settings.nonce}`;
        window.location.href = url;
    };

    return (
        <button
            className="button button-secondary"
            onClick={handleDownload}
            title="e-Taxソフト取込用CSV (Shift-JIS)"
            style={{ marginLeft: '10px' }}
        >
            {label}
        </button>
    );
};

export default AccountingPDFButton;
