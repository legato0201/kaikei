import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Spinner, Modal, Button, SelectControl, Notice } from '@wordpress/components';
import TransactionForm from './TransactionForm';
import AccountingPDFButton from './pdf/AccountingPDF';

// --- UI Helper Components ---
const StatusBadge = ({ status, settleDate, onSettle }) => {
    if (status === 'unsettled') {
        return (
            <span
                onClick={onSettle}
                className="status-badge unsettled"
                title="クリックで決済完了にする (入金消込)"
            >
                ⚠️ 未決済
            </span>
        );
    }
    return (
        <div className="status-cell-settled">
            <span className="status-icon-settled">✔</span>
            {settleDate && <span className="status-date">{settleDate}</span>}
        </div>
    );
};

const AmountCell = ({ type, amount, fee }) => {
    const isIncome = type === 'income';
    // Fee is strictly an expense, but here we show it as a deduction detail
    return (
        <div className="amount-cell">
            <div className={`amount-main ${isIncome ? 'text-income' : 'text-expense'}`}>
                ¥{Number(amount).toLocaleString()}
            </div>
            {Number(fee) > 0 && (
                <div className="amount-fee">
                    (手数料: -¥{Number(fee).toLocaleString()})
                </div>
            )}
        </div>
    );
};

const TransactionList = ({ refreshTrigger, externalFilter = null, lockedYear = 0 }) => {
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());

    // Search State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        keyword: '',
        category: '',
        partner: '',
        status: '' // 'settled' | 'unsettled' | ''
    });

    // Drill-down Logic
    useEffect(() => {
        if (externalFilter) {
            setFilters(prev => ({ ...prev, ...externalFilter }));
            // Auto-open filters?
            setIsSearchOpen(true);
            // Trigger fetch? 
            // Since setFilters is async, we can't fetch immediately with new filters here.
            // We rely on the fact that if externalFilter changes, we probably want to fetch.
            // But fetchTransactions reads 'filters' state. 
            // We use a key-based effect or just let the user click search? 
            // Better: Add a "trigger" state for search.
        }
    }, [externalFilter]);

    // Force fetch when filter is updated via drill-down (detected by externalFilter change + checking if filters match?)
    // Simplest: Add 'externalFilter' to dependency of the main fetch effect, but that might race.
    // Instead, let's make fetchTransactions read from args OR state.

    // Better: Helper Ref to track if we need to fetch after query update
    const [autoFetch, setAutoFetch] = useState(false);

    useEffect(() => {
        if (externalFilter) {
            setAutoFetch(true);
        }
    }, [externalFilter]);

    useEffect(() => {
        if (autoFetch) {
            fetchTransactions();
            setAutoFetch(false);
        }
    }, [filters, autoFetch]); // When filters update AND autoFetch is true

    // Edit Modal State
    const [editingTx, setEditingTx] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);



    // Settlement Modal State
    const [settlingTx, setSettlingTx] = useState(null);
    const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSettling, setIsSettling] = useState(false);

    const fetchTransactions = () => {
        setIsLoading(true);
        // Build Query
        let query = `/breeder/v1/transactions?year=${year}`;

        // Append Search Params
        if (filters.dateFrom) query += `&date_from=${filters.dateFrom}`;
        if (filters.dateTo) query += `&date_to=${filters.dateTo}`;
        if (filters.amountMin) query += `&amount_min=${filters.amountMin}`;
        if (filters.amountMax) query += `&amount_max=${filters.amountMax}`;
        if (filters.keyword) query += `&partner=${encodeURIComponent(filters.keyword)}`;
        if (filters.partner) query += `&partner=${encodeURIComponent(filters.partner)}`; // Specific partner field
        if (filters.category) query += `&category=${encodeURIComponent(filters.category)}`;

        apiFetch({ path: query })
            .then((data) => {
                setTransactions(data);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setIsLoading(false);
            });
    };

    useEffect(() => {
        fetchTransactions();
    }, [refreshTrigger, year]); // Note: Search trigger is manual or upon pressing 'Search' button.

    const handleSearch = () => {
        // Force refresh
        fetchTransactions();
    };

    const clearSearch = () => {
        setFilters({ dateFrom: '', dateTo: '', amountMin: '', amountMax: '', keyword: '', category: '', partner: '' });
        // DO NOT reset year here usually, keeps context. Or reset to current?
        // Let's keep year as selected.
        setTimeout(fetchTransactions, 0);
    };

    // ... (EDIT Handlers remain same) ...

    const handleEditClick = (tx) => {
        setEditingTx(tx);
        setIsModalOpen(true);
    };

    const handleEditSuccess = () => {
        setIsModalOpen(false);
        setEditingTx(null);
        fetchTransactions();
    };

    const handleFilterRequest = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
        closeModal();
        setIsModalOpen(false);
        // Maybe fetch? setFilters triggers fetch usually if useEffect depends on filters or we call search.
        // In this component, 'search' is manual or effect?
        // Let's check handleSearch. But setting filters state alone might not trigger fetch if it's manual.
        // Actually clearSearch calls fetch.
        // Let's call fetchTransactions() to be safe, or handleClick Search.
        setTimeout(fetchTransactions, 0);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTx(null);
        setSettlingTx(null);
    };

    const handleSettleClick = (tx) => {
        setSettlingTx(tx);
    };

    const confirmSettle = () => {
        // Locked Year Check
        const txYear = new Date(settlingTx.date).getFullYear();
        if (lockedYear > 0 && txYear <= lockedYear) {
            if (lockedYear > 0 && txYear <= lockedYear) {
                alert(`${txYear}年度はロックされています。この取引を変更することはできません。`);
                setSettlingTx(null);
                return;
            }
        }

        setIsSettling(true);
        apiFetch({
            path: `/breeder/v1/transactions/${settlingTx.id}`,
            method: 'PUT',
            data: { status: 'settled', deposit_date: depositDate }
        })
            .then(() => {
                setIsSettling(false);
                setSettlingTx(null);
                fetchTransactions();
            })
            .catch(() => {
                alert('Error settling transaction');
                setIsSettling(false);
            });
    };

    // Admin POST URL for export
    const exportBaseUrl = window.breederAccountingSettings ? window.breederAccountingSettings.root.replace('/wp-json/', '/wp-admin/admin-post.php?action=breeder_export_csv') : '';
    const exportUrl = `${exportBaseUrl}&year=${year}`;

    // Categories for Filter (Should match Form)
    const incomeCategories = [
        { label: '売上高 (Sales)', value: '売上高' },
        { label: '雑収入 (Misc Income)', value: '雑収入' },
    ];
    const expenseCategories = [
        { label: '仕入高 (Purchases)', value: '仕入高' },
        { label: '消耗品費 (Supplies)', value: '消耗品費' },
        { label: '荷造運賃 (Shipping)', value: '荷造運賃' },
        { label: '水道光熱費 (Utilities)', value: '水道光熱費' },
        { label: '通信費 (Communication)', value: '通信費' },
        { label: '旅費交通費 (Travel)', value: '旅費交通費' },
        { label: '支払手数料 (Fees)', value: '支払手数料' },
        { label: '広告宣伝費 (Ads)', value: '広告宣伝費' },
        { label: '接待交際費 (Entertainment)', value: '接待交際費' },
        { label: '修繕費 (Repairs)', value: '修繕費' },
        { label: '消耗品費 (Consumables)', value: '消耗品費' },
        { label: '給料賃金 (Wages)', value: '給料賃金' },
        { label: '外注工賃 (Outsourcing)', value: '外注工賃' },
        { label: '地代家賃 (Rent)', value: '地代家賃' },
        { label: '減価償却費 (Depreciation)', value: '減価償却費' },
        { label: '租税公課 (Taxes)', value: '租税公課' },
        { label: '雑費 (Misc)', value: '雑費' },
    ];

    // Compute Running Balance & Apply Status Filter
    const getDisplayTransactions = () => {
        let data = [...transactions];

        if (filters.status) {
            data = data.filter(tx => {
                if (filters.status === 'unsettled') return tx.status !== 'settled';
                if (filters.status === 'settled') return tx.status === 'settled';
                return true;
            });
        }

        // De-duplication: Hide child fees if parent income tx is present (because parent will render visual fee row)
        // Only if NOT in GL mode (or maybe also in GL mode? GL Logic handles duplication check itself)
        // Let's apply it globally for safety, but check if GL mode needs it.
        // GL mode's PDF generation logic checks for duplication: `!isDuplicate`.
        // So this global filter might affect GL's ability to see/link.
        // BUT, Journal View (Table) uses `pdfData` which is map of `displayTransactions`.
        // If we filter here, standard Journal view is clean.
        // What about GL Mode? GL mode relies on `displayTransactions` too.
        // If we remove the child expense here, GL mode won't see it.
        // Does GL mode's "Virtual Fee match" logic handle it?
        // Yes: `if (tx.type === 'income' && fee > 0 && isFeeLedger)` -> it adds a virtual debit.
        // So filtering it here is actually SAFE and Cleaner for GL too (removes the "Real" debit, forcing "Virtual" logic).

        // However, we must be careful: If `filters.category` is set to Fees, we WANT to see fees.
        // If we filter out the child fee, we only see the Parent Income.
        // Parent Income is NOT type='expense'.
        // So if filtering by Category='Fees', Parent Income (Category='Sales') is filtered out by `filters.category`.
        // So `displayTransactions` will ONLY contain the Child Expense (which has Category='Fees').
        // So we MUST NOT filter out Child Expense if Parent is missing.

        if (!filters.category) {
            // Only de-duplicate in Journal/Timeline view (No category filter)
            const parentIds = new Set(data.filter(t => t.type === 'income').map(t => t.id));
            data = data.filter(tx => {
                // Return FALSE to remove if it is a child expense AND parent is in list
                if (tx.type === 'expense' && tx.parent_id && parentIds.has(String(tx.parent_id))) {
                    return false;
                }
                return true;
            });
        }

        if (filters.category) {
            // GL Mode: Sort ASC
            data.sort((a, b) => new Date(a.date) - new Date(b.date));
            let balance = 0;
            return data.map(tx => {
                balance += parseInt(tx.amount_net || 0);
                return { ...tx, balance };
            });
        }

        return data; // Timeline/Journal default (usually DESC)
    };

    const displayTransactions = getDisplayTransactions();
    const isGLMode = !!filters.category; // General Ledger Mode

    const handlePrint = () => {
        window.print();
    };

    // Prepare PDF Data
    // Determine Account Type for Balance Calculation
    // Asset/Expense: Debit +, Credit - (Normal Balance: Dr)
    // Revenue/Liability/Equity: Credit +, Debit - (Normal Balance: Cr)
    const isCreditBalance = incomeCategories.some(c => c.value === filters.category) ||
        ['未払金', '事業主借', '預り金'].includes(filters.category); // Basic Liability/Equity list

    // Config
    const pdfConfig = {
        entityName: (window.breederAccountingSettings?.settings?.profile?.owner_name) || (window.breederAccountingSettings?.entityName) || '事業主',
        period: `${year}年1月1日 〜 ${year}年12月31日`,
        createdDate: new Date().toLocaleDateString('ja-JP'),
        accountName: filters.category || '',
        initialBalance: 0,
        accountType: isCreditBalance ? 'credit_balance' : 'debit_balance', // NEW PROP
    };

    // --- PDF Helper: Clean Description ---
    const formatDescription = (text) => {
        if (!text) return '';
        // Remove system tags like (手: 100) or (消費税: 100)
        return text.replace(/\s*\((手|消費税|Tax):\s*[0-9,¥￥]+\)/g, '').trim();
    };

    // PDF Data Preparation - Sort by Date (ASC) for Paper Output
    // User Requirement: "Always sort Date ASC (1/1 -> 12/31) for PDF"
    const pdfSourceData = [...displayTransactions].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        // Secondary Sort by ID (Creation Order) to keep stable
        return a.id - b.id;
    });

    const pdfData = pdfSourceData.map(tx => {
        const dateFormatted = tx.date ? tx.date.replace(/-/g, '/') : '';
        const fee = Number(tx.fee || 0);
        const shippingFee = Number(tx.shipping_fee || 0); // NEW: Extract Shipping
        const net = Number(tx.amount_net || 0);
        const gross = net + fee + shippingFee; // Updated Gross to include Shipping

        // Raw description from inputs
        const rawDesc = [tx.partner_name, tx.description].filter(Boolean).join(' ');

        // Clean description for PDF (User requested no system tags)
        let cleanDesc = formatDescription(rawDesc);
        if (!cleanDesc && fee > 0) cleanDesc = '売上'; // Fallback

        if (isGLMode) {
            // General Ledger Logic

            // Hybrid GL Logic: 
            // 1. Standard Debit/Credit match (Catches migrated Expense records)
            // 2. Virtual Fee match (Catches non-migrated Income records with explicit Fee)

            // Check De-duplication: Does this Income TX have a child Expense TX in the current list?
            // (Only relevant if this is an Income TX with Fee, and we are looking at Fee Ledger)
            const isFeeLedger = filters.category === '支払手数料';
            const isShippingLedger = filters.category === '荷造運賃'; // NEW

            let isDuplicate = false;
            // Note: fee is from amount_gross * rate? No, tx.fee
            if (tx.type === 'income' && (fee > 0 || shippingFee > 0) && (isFeeLedger || isShippingLedger)) {
                // If migration ran, there should be a child with parent_id = tx.id
                // displayTransactions has potentially both.
                isDuplicate = displayTransactions.some(t => String(t.parent_id) === String(tx.id));
            }

            // A. Standard Matches
            // Fallback: If allowance is not set, use category for Expenses (Debit) or Sales (Credit)
            const effDebit = tx.debit_allowance || (tx.type === 'expense' ? tx.category : '');
            const effCredit = tx.credit_allowance || (tx.type === 'income' ? (tx.category || '売上高') : '');

            let isDebit = effDebit === filters.category;
            let isCredit = effCredit === filters.category;

            // B. Virtual Fee Match (Only if not duplicate)
            if (isFeeLedger && tx.type === 'income' && fee > 0 && !isDuplicate) {
                // Force this to be treated as a Debit on the Fee Ledger
                isDebit = true;
            }
            // C. Virtual Shipping Match (NEW)
            if (isShippingLedger && tx.type === 'income' && shippingFee > 0 && !isDuplicate) {
                isDebit = true;
            }

            let counter = '';
            let dr = 0;
            let cr = 0;

            // Counter Account Logic (Refined)
            // If it's a split transaction (Fee > 0), strictly it is '諸口'.
            // However, user requested "Specific Account" if possible.
            // But for Sales with Fee, the counter accounts ARE 'Receivable' and 'Fee Expense'.
            // So '諸口' is technically correct.
            // If Fee is 0, we should definitely show the specific account.

            if (isDebit) {
                // Logic: MATCHED DEBIT
                // Case 1: Real Expense Record (Fee)
                if (tx.type === 'expense') {
                    dr = net; // The amount of the expense
                    counter = tx.credit_allowance || '売掛金';
                }
                // Case 2: Virtual Fee from Income
                else if (tx.type === 'income' && isFeeLedger) {
                    dr = fee; // The Fee amount
                    counter = '諸口'; // or '売掛金'
                }
                // Case 3: Virtual Shipping from Income (NEW)
                else if (tx.type === 'income' && isShippingLedger) {
                    dr = shippingFee;
                    counter = '諸口';
                }
                // Case 4: Other Debits
                else {
                    dr = net;
                    counter = tx.credit_allowance || '現金';
                }
            } else if (isCredit) {
                // Logic: MATCHED CREDIT (Revenue)
                if (tx.type === 'income') {
                    cr = tx.amount_gross || gross;
                    counter = tx.debit_allowance || '現金';
                } else {
                    cr = net;
                    counter = tx.debit_allowance || '現金';
                }
            } else {
                return [];
            }

            // Description Logic
            if (tx.type === 'income' && (fee > 0 || shippingFee > 0) && isDebit) {
                // Virtual Fee/Shipping Row: Synthesize Smart Description
                // Format: [Platform]決済手数料 (Item Name) or [Platform]送料 (Item Name)
                let platform = 'Stripe'; // Default guess or generic
                // Guess based on payment source if available
                if (tx.payment_source) {
                    const ps = tx.payment_source.toLowerCase();
                    if (ps.includes('yahoo') || ps.includes('auction')) {
                        platform = isShippingLedger ? 'ヤフオク送料' : 'ヤフオク落札システム利用料'; // Special case
                    } else if (ps.includes('stripe')) {
                        platform = isShippingLedger ? 'Stripe送料' : 'Stripe決済手数料';
                    } else {
                        platform = isShippingLedger ? '送料' : '決済手数料';
                    }
                } else {
                    platform = isShippingLedger ? '送料' : '決済手数料';
                }

                // If platform is the long Japanese string, don't double append
                const prefix = platform;

                // Original Item Name (cleaned)
                // If cleanDesc is just "売上", use raw desc if safe? use cleanDesc.
                // User wants: "Stripe決済手数料 (Item Name)"
                const originalItem = (cleanDesc && cleanDesc !== '売上') ? cleanDesc : (tx.description || '');

                cleanDesc = originalItem ? `${prefix} (${originalItem})` : prefix;
            }

            return [{
                date: dateFormatted,
                counterAccount: counter || '不明',
                description: cleanDesc,
                debitAmount: dr,
                creditAmount: cr,
            }];


        } else {
            // Journal Logic
            const rows = [];

            // Determines Accounts
            let debitAcct = tx.debit_allowance;
            let creditAcct = tx.credit_allowance;

            // Platform Detection for Smart Logic
            const pSource = (tx.payment_source || '').toLowerCase();
            let platformName = '';
            if (pSource === 'stripe') platformName = 'Stripe';
            else if (pSource === 'yahoo') platformName = 'Yahoo';

            if (tx.type === 'income') {
                if (!debitAcct) {
                    if (platformName === 'Stripe') debitAcct = '売掛金(Stripe)';
                    else if (platformName === 'Yahoo') debitAcct = '売掛金(Yahoo)';
                    else if (pSource === 'bank') debitAcct = '普通預金';
                    else if (pSource === 'cash') debitAcct = '現金';
                    else debitAcct = (fee > 0 || shippingFee > 0) ? '売掛金' : '現金';
                }
                if (!creditAcct) creditAcct = tx.category || '売上高';
            } else {
                if (!debitAcct) debitAcct = tx.category || '消耗品費';
                if (!creditAcct) {
                    if (pSource === 'bank') creditAcct = '普通預金';
                    else if (pSource === 'cash') creditAcct = '現金';
                    else if (pSource === 'private_card') creditAcct = '事業主借';
                    else creditAcct = '現金';
                }
            }

            const mainAmount = ((fee > 0 || shippingFee > 0) && tx.type === 'income') ? gross : net;

            // Row 1 (Main Sales)
            rows.push({
                date: dateFormatted,
                debitAccount: debitAcct,
                creditAccount: creditAcct,
                debitAmount: mainAmount,
                creditAmount: mainAmount,
                description: cleanDesc,
            });

            // Row 2 (Fee) - Visual Grouping & Smart Partner
            if (fee > 0 && tx.type === 'income') {
                // Smart Description: └ 決済手数料 (Platform)
                let feeDesc = '└ 決済手数料';
                if (platformName) {
                    feeDesc += ` (${platformName})`;
                }

                rows.push({
                    date: '', // Empty date for visual grouping
                    debitAccount: '支払手数料',
                    creditAccount: debitAcct,
                    debitAmount: fee,
                    creditAmount: fee,
                    description: feeDesc,
                });
            }

            // Row 3 (Shipping) - Visual Grouping (NEW)
            if (shippingFee > 0 && tx.type === 'income') {
                // Smart Description: └ 送料
                let shipDesc = '└ 送料';
                // if (platformName) {
                //    shipDesc += ` (${platformName})`;
                // }

                rows.push({
                    date: '', // Empty date for visual grouping
                    debitAccount: '荷造運賃',
                    creditAccount: debitAcct, // Reduces the same Receivable
                    debitAmount: shippingFee,
                    creditAmount: shippingFee,
                    description: shipDesc,
                });
            }

            return rows;
        }
    });



    return (
        <div className="pro-transaction-list">
            {/* Header Section */}
            <div className="list-header no-print">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
                            {isGLMode ? `総勘定元帳: ${filters.category}` : '取引タイムライン'}
                        </h2>

                        <Button isSecondary onClick={() => setIsSearchOpen(!isSearchOpen)}>
                            {isSearchOpen ? '閉じる' : '🔍 検索・絞り込み'}
                        </Button>

                        {!isSearchOpen && (
                            <div className="year-selector">
                                <span>年度:</span>
                                <SelectControl
                                    value={year}
                                    options={[
                                        { label: '2027', value: 2027 },
                                        { label: '2026', value: 2026 },
                                        { label: '2025', value: 2025 },
                                        { label: '2024', value: 2024 },
                                    ]}
                                    onChange={(v) => setYear(v)}
                                />
                            </div>
                        )}

                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                        <AccountingPDFButton
                            type={isGLMode ? 'ledger' : 'journal'}
                            data={pdfData}
                            config={{
                                ...pdfConfig,
                                ownerName: window.breederAccountingSettings?.profile?.owner_name || window.breederAccountingSettings?.settings?.entityName || ''
                            }}
                            buttonLabel={isGLMode ? 'PDF (元帳)' : '📄 PDF出力'}
                        />
                        <a href={exportUrl} className="components-button is-primary" style={{ borderRadius: '6px', fontWeight: 500 }}>
                            CSV出力
                        </a>
                    </div>
                </div>

                {/* Premium Search Panel */}
                {isSearchOpen && (
                    <div className="search-panel">
                        <div className="search-grid">
                            <div className="search-group">
                                <label>Category (勘定科目)</label>
                                <SelectControl
                                    value={filters.category}
                                    options={[
                                        { label: '全ての科目', value: '' },
                                        { label: '--- 収入 (Income) ---', value: '', disabled: true },
                                        ...incomeCategories,
                                        { label: '--- 支出 (Expenses) ---', value: '', disabled: true },
                                        ...expenseCategories
                                    ]}
                                    onChange={(v) => setFilters({ ...filters, category: v })}
                                />
                            </div>

                            <div className="search-group">
                                <label>決済状況 (Status)</label>
                                <SelectControl
                                    value={filters.status}
                                    options={[
                                        { label: '全て', value: '' },
                                        { label: '未決済のみ', value: 'unsettled' },
                                        { label: '決済済み', value: 'settled' },
                                    ]}
                                    onChange={(v) => setFilters({ ...filters, status: v })}
                                />
                            </div>

                            <div className="search-group">
                                <label>期間 (Date)</label>
                                <div className="date-inputs">
                                    <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
                                    <span>to</span>
                                    <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
                                </div>
                            </div>

                            <div className="search-group">
                                <label>金額範囲 (円)</label>
                                <div className="date-inputs">
                                    <input type="number" placeholder="Min" value={filters.amountMin} onChange={e => setFilters({ ...filters, amountMin: e.target.value })} style={{ width: '80px' }} />
                                    <span>~</span>
                                    <input type="number" placeholder="Max" value={filters.amountMax} onChange={e => setFilters({ ...filters, amountMax: e.target.value })} style={{ width: '80px' }} />
                                </div>
                            </div>

                            <div className="search-group">
                                <label>キーワード / 取引先名</label>
                                <input
                                    type="text"
                                    placeholder="取引先名、摘要など..."
                                    value={filters.keyword}
                                    onChange={e => setFilters({ ...filters, keyword: e.target.value })}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                        <div className="search-actions">
                            <Button isTertiary onClick={clearSearch}>クリア</Button>
                            <Button isPrimary onClick={handleSearch}>検索</Button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                /* Modern UI Styles */
                .pro-transaction-list { 
                    background: #f8fafc; /* Lighter background for the container */
                    border-radius: 12px; 
                    box-shadow: none; 
                    overflow: visible; /* Allow sticky headers */
                    margin-top: 20px;
                    border: none;
                    font-family: 'Inter', system-ui, sans-serif;
                }
                .list-header {
                    padding: 20px 24px;
                    border-bottom: 1px solid #e2e8f0;
                    background: #fff;
                    border-radius: 12px 12px 0 0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    position: relative;
                    z-index: 20;
                }
                .year-selector {
                    display: flex; align-items: center; gap: 8px; 
                    background: #f1f5f9; padding: 4px 10px; border-radius: 20px;
                    font-size: 0.8rem; font-weight: 600; color: #64748b;
                }
                .year-selector select {
                    background: transparent; border: none; font-size: 0.9rem; margin: 0;
                }

                /* Timeline Container */
                .timeline-container {
                    padding: 0 0 40px 0;
                }

                /* Date Group Header */
                .date-header {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    background: #f8fafc; /* Matches container bg */
                    padding: 24px 20px 10px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #64748b;
                    border-bottom: 1px dashed #cbd5e1;
                    margin-bottom: 10px;
                    display: flex; justify-content: space-between; align-items: flex-end;
                }

                /* Card Row */
                .tx-card {
                    background: #fff;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 16px;
                    margin: 0 20px 10px; /* Side margins */
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.2s;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                }
                .tx-card:hover {
                    border-color: #cbd5e1;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                    transform: translateY(-1px);
                }

                /* Left Side */
                .card-left { display: flex; items-center; gap: 16px; flex: 1; }
                .icon-box {
                    width: 44px; height: 44px; 
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.4rem;
                    flex-shrink: 0;
                }
                .icon-box.income { background: #eff6ff; color: #2563eb; }
                .icon-box.expense { background: #fef2f2; color: #dc2626; }

                .tx-info { display: flex; flex-direction: column; }
                .tx-main { font-weight: 700; color: #1e293b; font-size: 1rem; line-height: 1.2; }
                .tx-sub { font-size: 0.8rem; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 8px; }
                
                /* Receipt Badge */
                .badge-receipt {
                    display: inline-flex; align-items: center; gap: 4px;
                    background: #f0f9ff; color: #0284c7;
                    padding: 2px 6px; border-radius: 4px;
                    font-size: 0.7rem; font-weight: 600;
                    text-decoration: none;
                }
                .badge-receipt:hover { text-decoration: underline; }

                /* Right Side */
                .card-right { display: flex; align-items: center; gap: 20px; }
                
                .amount-group { text-align: right; }
                .amount-val { font-weight: 700; font-size: 1.1rem; font-feature-settings: "tnum"; }
                .text-income { color: #2563eb; }
                .text-expense { color: #dc2626; }
                
                .fee-note { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }

                .status-group { width: 100px; text-align: right; }

                /* Actions */
                .action-group { display: flex; gap: 4px; }
                .action-btn { 
                    background: none; border: none; cursor: pointer; padding: 8px; 
                    border-radius: 6px; color: #cbd5e1; transition: all 0.2s;
                    font-size: 1.1rem;
                }
                .action-btn:hover { color: #3b82f6; background: #f1f5f9; }

                /* Auditor Details (Inside Card now) */
                .auditor-panel {
                    margin-top: 10px;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 6px;
                    border: 1px dashed #e2e8f0;
                    font-family: monospace;
                    font-size: 0.75rem;
                    color: #475569;
                    display: flex; gap: 15px;
                }

                /* Mobile Defaults */
                @media (max-width: 640px) {
                    .tx-card { flex-direction: column; align-items: stretch; gap: 12px; padding: 12px; }
                    .card-left { margin-bottom: 8px; }
                    .card-right { justify-content: space-between; width: 100%; border-top: 1px solid #f1f5f9; padding-top: 12px; }
                    .amount-group { text-align: left; }
                    .status-group { text-align: right; width: auto; }
                    .action-group { position: absolute; top: 10px; right: 10px; } /* Floating actions on mobile? Or keep inline */
                    /* Let's keep inline for simplicity, or simplify */
                }

                /* Search Panel Styles (refined) */
                .search-panel { margin-top: 20px; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
                .search-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
                .search-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 8px; }
                
                /* Default input full width */
                .search-group input, .search-group select { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; box-sizing: border-box; }
                
                /* Date & Amount Ranges: Flex container fixes */
                .date-inputs { display: flex; gap: 8px; align-items: center; }
                .date-inputs input { width: auto; flex: 1; min-width: 0; } /* Allow shrink, share space */
                .date-inputs span { color: #94a3b8; font-size: 0.85rem; white-space: nowrap; }

                .search-actions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px; }

                @media print {
                    .no-print { display: none !important; }
                    .pro-transaction-list { border: none; box-shadow: none; margin: 0; }
                    .date-header { position: static; border-bottom: 1px solid #000; }
                }
            `}</style>

            {/* Content Area */}
            {
                isLoading ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}><Spinner /></div>
                ) : displayTransactions.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📭</div>
                        No transactions found for {year}.
                    </div>
                ) : (
                    <div className="journal-container" style={{ padding: '20px', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Description (摘要)</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Debit (借方)</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Credit (貸方)</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pdfData.map((rows, idx) => {
                                    // rows is an array of 1 or more row objects
                                    // Mapping back to original transaction object:
                                    const sourceTx = pdfSourceData[idx]; // pdfData index matches pdfSourceData index

                                    return rows.map((row, rIdx) => (
                                        <tr
                                            key={`${idx}-${rIdx}`}
                                            style={{
                                                borderBottom: rows.length > 1 && rIdx === rows.length - 1 ? '2px solid #e2e8f0' : '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onClick={() => handleEditClick(sourceTx)}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            title="Click to Edit / View Audit Log"
                                        >
                                            <td style={{ padding: '10px', color: '#64748b' }}>{rIdx === 0 ? row.date : ''}</td>
                                            <td style={{ padding: '10px' }}>{row.description}</td>
                                            <td style={{ padding: '10px' }}>
                                                {isGLMode ? (row.debitAmount > 0 ? (filters.category || 'Details') : '') : row.debitAccount}
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                {isGLMode ? (row.creditAmount > 0 ? (filters.category || 'Details') : '') : row.creditAccount}
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                                                {isGLMode ? (
                                                    row.debitAmount > 0 ? Number(row.debitAmount).toLocaleString() : Number(row.creditAmount).toLocaleString()
                                                ) : (
                                                    Number(row.debitAmount).toLocaleString()
                                                )}
                                            </td>
                                        </tr>
                                    ));
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            }

            {
                isModalOpen && (
                    <Modal title="Edit Transaction" onRequestClose={closeModal}>
                        <TransactionForm
                            initialData={editingTx}
                            onSuccess={handleEditSuccess}
                            onCancel={closeModal}
                            onFilterRequest={handleFilterRequest}
                            lockedYear={lockedYear}
                        />
                    </Modal>
                )
            }

            {
                settlingTx && (
                    <Modal title="Confirm Settlement" onRequestClose={closeModal}>
                        <div style={{ padding: '24px' }}>
                            <h3 style={{ marginTop: 0 }}>Mark as Settled (入金確認)</h3>
                            <p style={{ color: '#64748b' }}>
                                Transaction: <strong>{settlingTx.partner_name}</strong> - ¥{Number(settlingTx.amount_net).toLocaleString()}
                            </p>
                            <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Deposit Date (入金日):</label>
                            <input
                                type="date"
                                value={depositDate}
                                onChange={(e) => setDepositDate(e.target.value)}
                                style={{
                                    padding: '10px',
                                    width: '100%',
                                    marginBottom: '24px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '1rem'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <Button isSecondary onClick={closeModal}>Cancel</Button>
                                <Button isPrimary onClick={confirmSettle} isBusy={isSettling}>Confirm Settlement</Button>
                            </div>
                        </div>
                    </Modal>
                )
            }
        </div >
    );
};
export default TransactionList;
