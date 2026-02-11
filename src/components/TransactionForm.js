import { useState, useEffect, useRef } from '@wordpress/element';
import {
    Button,
    TextControl,
    SelectControl,
    TextareaControl,
    ToggleControl,
    Notice,
    Card,
    CardBody,
    CardHeader,
    Modal
} from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import AuditLogViewer from './AuditLogViewer';

const TransactionForm = ({ onSuccess, initialData = null, onCancel = null, onFilterRequest = null, lockedYear = 0 }) => {
    // Basic
    const [date, setDate] = useState(initialData ? initialData.date : new Date().toISOString().split('T')[0]);
    const [type, setType] = useState(initialData ? initialData.type : 'income');
    const [category, setCategory] = useState(initialData ? initialData.category : '売上高');
    const [amount, setAmount] = useState(initialData ? initialData.amount_gross : '');
    const [description, setDescription] = useState(initialData ? initialData.description : '');
    // Pro Fields
    const [partnerName, setPartnerName] = useState(initialData ? initialData.partner_name : '');
    const [taxRate, setTaxRate] = useState(initialData ? initialData.tax_rate : '10');
    const [invoiceNo, setInvoiceNo] = useState(initialData ? initialData.invoice_no : '');
    const [paymentSource, setPaymentSource] = useState(initialData ? initialData.payment_source : '');

    const [isHusbandPaid, setIsHusbandPaid] = useState(initialData ? (initialData.is_husband_paid == '1') : false);
    const [subCategory, setSubCategory] = useState(initialData ? (initialData.sub_category || '') : '');

    // Settlement
    const [status, setStatus] = useState(initialData ? initialData.status : 'settled');
    const [depositDate, setDepositDate] = useState(initialData ? initialData.deposit_date : '');

    // File
    const [receiptFile, setReceiptFile] = useState(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // ▼ 追加: ドラッグ&ドロップ用のState
    const [isDragging, setIsDragging] = useState(false);

    // ▼ 追加: ドラッグ&ドロップのイベントハンドラ
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            setReceiptFile(files[0]);
            e.dataTransfer.clearData();
        }
    };

    // ▼ 追加: スキャン完了時のハンドラ
    const handleScanComplete = (file) => {
        setReceiptFile(file);
        setIsScannerOpen(false);
    };

    const [fee, setFee] = useState(initialData ? initialData.fee : '');
    const [shippingFee, setShippingFee] = useState(initialData ? (initialData.shipping_fee || '') : '');

    // UI State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    // Inventory Integration State
    const [addToInventory, setAddToInventory] = useState(false);
    const [inventoryItemName, setInventoryItemName] = useState('');
    const [inventoryQty, setInventoryQty] = useState(1);

    // ▼ 追加: 取引先名の候補リスト用State
    const [partnerSuggestions, setPartnerSuggestions] = useState([]);

    const isEditMode = !!initialData;

    // Accounts (Standard List)
    const incomeCategories = [
        { label: 'Sales (売上高)', value: '売上高' },
        { label: 'Misc Income (雑収入)', value: '雑収入' },
    ];
    const expenseCategories = [
        { label: 'Purchases (仕入高)', value: '仕入高' },
        { label: 'Supplies (消耗品費)', value: '消耗品費' },
        { label: 'Shipping (荷造運賃)', value: '荷造運賃' },
        { label: 'Utilities (水道光熱費)', value: '水道光熱費' },
        { label: 'Travel (旅費交通費)', value: '旅費交通費' },
        { label: 'Communication (通信費)', value: '通信費' },
        { label: 'Advertising (広告宣伝費)', value: '広告宣伝費' },
        { label: 'Entertainment (接待交際費)', value: '接待交際費' },
        { label: 'Insurance (損害保険料)', value: '損害保険料' },
        { label: 'Repairs (修繕費)', value: '修繕費' },
        { label: 'Welfare (福利厚生費)', value: '福利厚生費' },
        { label: 'Wages (給料賃金)', value: '給料賃金' },
        { label: 'Outsourcing (外注工賃)', value: '外注工賃' },
        { label: 'Interest (利子割引料)', value: '利子割引料' },
        { label: 'Rent (地代家賃)', value: '地代家賃' },
        { label: 'bad Debt (貸倒引当金)', value: '貸倒引当金' },
        { label: 'Fees (支払手数料)', value: '支払手数料' },
        { label: 'Taxes (租税公課)', value: '租税公課' },
        { label: 'Misc (雑費)', value: '雑費' },
    ];

    const currentCategories = type === 'income' ? incomeCategories : expenseCategories;

    // Set default category when type changes
    useEffect(() => {
        if (!isEditMode) {
            setCategory(type === 'income' ? '売上高' : '消耗品費');
        }
    }, [type]);

    // ▼ 追加: 過去の取引から取引先名の一覧を取得して候補セットを作成
    useEffect(() => {
        apiFetch({ path: '/breeder/v1/transactions' })
            .then((data) => {
                if (Array.isArray(data)) {
                    // 重複を除外してリスト化
                    const uniquePartners = [...new Set(data
                        .map(tx => tx.partner_name)
                        .filter(name => name && name.trim() !== '')
                    )];
                    setPartnerSuggestions(uniquePartners);
                }
            })
            .catch(console.error);
    }, []);

    // Fee Auto-Calc Logic
    const handleAmountChange = (val) => {
        setAmount(val);
        // Auto-calc fee if Source is set
        if (paymentSource === 'stripe') {
            setFee(Math.round(val * 0.036));
        } else if (paymentSource === 'yahoo') {
            setFee(Math.floor(val * 0.10));
        }
    };

    const handleSourceChange = (val) => {
        setPaymentSource(val);
        if (type === 'expense') {
            setIsHusbandPaid(val === 'private_card');
        }
        // Auto-calc based on current Amount
        if (paymentSource === 'stripe') {
            setFee(Math.round(amount * 0.036));
        } else if (paymentSource === 'yahoo') {
            setFee(Math.floor(amount * 0.10));
        } else {
            if (val === 'cash' || val === 'bank' || val === 'none') {
                setFee(0);
            }
        }
    };

    // Fees for display logic
    const isPlatformSale = type === 'income' && (paymentSource === 'stripe' || paymentSource === 'yahoo');
    const feeRate = paymentSource === 'stripe' ? 0.036 : (paymentSource === 'yahoo' ? 0.10 : 0);
    const estimatedFee = isPlatformSale && amount ? (paymentSource === 'yahoo' ? Math.floor(amount * feeRate) : Math.round(amount * feeRate)) : 0;
    const finalFee = fee !== '' ? fee : estimatedFee;
    const finalShipping = shippingFee !== '' ? shippingFee : 0;
    const estimatedNet = isPlatformSale && amount ? amount - finalFee - finalShipping : amount;

    const handleSubmit = () => {
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);

        // Validation: Locked Year
        const txYear = new Date(date).getFullYear();
        if (lockedYear > 0 && txYear <= lockedYear) {
            setError(`Fiscal Year ${txYear} is locked. You cannot add or edit transactions for this period.`);
            setIsSubmitting(false);
            return;
        }

        if (isEditMode && initialData) {
            const originalYear = new Date(initialData.date).getFullYear();
            if (lockedYear > 0 && originalYear <= lockedYear) {
                setError(`Fiscal Year ${originalYear} is locked. You cannot modify this transaction.`);
                setIsSubmitting(false);
                return;
            }
        }

        const path = isEditMode ? `/breeder/v1/transactions/${initialData.id}` : '/breeder/v1/transactions';
        const formData = new FormData();
        if (isEditMode) formData.append('id', initialData.id);

        formData.append('date', date);
        formData.append('type', type);
        formData.append('category', category);
        formData.append('sub_category', subCategory);
        formData.append('amount_gross', amount);
        formData.append('fee', fee);
        formData.append('shipping_fee', shippingFee);
        formData.append('description', description);
        formData.append('payment_source', paymentSource);
        formData.append('is_husband_paid', isHusbandPaid ? '1' : '0');
        formData.append('partner_name', partnerName);
        formData.append('tax_rate', taxRate);
        formData.append('invoice_no', invoiceNo);
        formData.append('status', status);
        formData.append('deposit_date', depositDate);

        if (receiptFile) {
            formData.append('receipt', receiptFile);
        }

        // Inventory Data
        formData.append('add_to_inventory', addToInventory);
        formData.append('inventory_item_name', inventoryItemName);
        formData.append('inventory_qty', inventoryQty);

        const fetchOptions = {
            path: path,
            method: 'POST',
            body: formData,
        };

        apiFetch(fetchOptions)
            .then((response) => {
                setIsSubmitting(false);
                setSuccess(true);
                if (!isEditMode) {
                    setAmount('');
                    setPartnerName('');
                    setDescription('');
                    setInvoiceNo('');
                    setReceiptFile(null);
                }
                if (onSuccess) onSuccess();
                setTimeout(() => setSuccess(false), 3000);
            })
            .catch((err) => {
                setIsSubmitting(false);
                setError(err.message || 'An error occurred.');
            });
    };

    return (
        <div className="pro-transaction-form">
            <style>{`
                .pro-transaction-form { 
                    max-width: 1200px; 
                    margin: 0 auto; 
                    background: #f0f2f5; 
                    padding: 20px;
                }
                .form-header-bar {
                    background: #fff;
                    padding: 15px 20px;
                    border-radius: 8px;
                    border: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .form-header-bar h2 { margin: 0; font-size: 1.2rem; color: #2c3338; font-weight: 600; }
                
                .form-grid { 
                    display: grid; 
                    grid-template-columns: 3fr 2fr; 
                    gap: 20px; 
                }
                @media (max-width: 768px) {
                    .form-grid { grid-template-columns: 1fr; }
                }

                .form-card {
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .form-card-header {
                    padding: 12px 15px;
                    border-bottom: 1px solid #f0f0f0;
                    background: #fafafa;
                    border-radius: 8px 8px 0 0;
                    font-weight: 600;
                    color: #444;
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .form-card-body { padding: 20px; }

                .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
                .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px; }

                /* Custom Amount Input */
                .amount-input-group input { font-size: 1.25rem; font-weight: bold; color: #1e293b; }
                
                /* Calc Box Modern */
                .calc-box-modern {
                    background: #effaf3; 
                    border: 1px solid #ccebd4; 
                    padding: 15px; 
                    border-radius: 6px; 
                    margin-top: 10px;
                }
                .calc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 0.85rem; }
                .calc-row.final { border-top: 1px dashed #a3d9b1; margin-top: 8px; padding-top: 8px; font-weight: bold; font-size: 1rem; color: #166534; }
                .calc-label { color: #14532d; }
                .calc-val { color: #166534; }
                
                .shipping-input-embedded { margin-top: 10px; padding-top: 10px; border-top: 1px solid #ccebd4; }

                .status-badge {
                    display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;
                    margin-left: 10px;
                }
                .status-settled { background: #dcfce7; color: #166534; }
                .status-unsettled { background: #fee2e2; color: #991b1b; }

            `}</style>

            <div className="form-header-bar">
                <h2>{isEditMode ? '取引の編集' : '新規取引の作成'}</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {isEditMode && (
                        <Button isSmall isSecondary onClick={() => setShowHistory(true)}>
                            履歴を表示
                        </Button>
                    )}
                    {isEditMode && <Button isSmall isDestructive onClick={onCancel}>キャンセル</Button>}
                </div>
            </div>

            {showHistory && (
                <AuditLogViewer
                    transactionId={initialData.id}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {error && <Notice status="error" isDismissible={false}>{error}</Notice>}
            {success && <Notice status="success" isDismissible={false}>取引を{isEditMode ? '更新' : '保存'}しました。</Notice>}

            <div className="form-grid">

                {/* --- LEFT COLUMN: CORE INPUTS --- */}
                <div className="left-col">

                    {/* CARD 1: BASIC INFO */}
                    <div className="form-card">
                        <div className="form-card-header">基本情報</div>
                        <div className="form-card-body">
                            <div className="form-row-2">
                                <TextControl
                                    label="取引日 (Date)"
                                    type="date"
                                    value={date}
                                    onChange={setDate}
                                />
                                <SelectControl
                                    label="収支区分 (Type)"
                                    value={type}
                                    options={[
                                        { label: '売上 (Income)', value: 'income' },
                                        { label: '経費 (Expense)', value: 'expense' },
                                    ]}
                                    onChange={setType}
                                />
                            </div>
                            <SelectControl
                                label={
                                    <span>
                                        Category (勘定科目)
                                        {isEditMode && onFilterRequest && (
                                            <span style={{ cursor: 'pointer', marginLeft: '8px', fontSize: '0.8rem', color: '#007cba' }}
                                                onClick={() => onFilterRequest({ category })}>
                                                (元帳を表示)
                                            </span>
                                        )}
                                    </span>
                                }
                                value={category}
                                options={currentCategories}
                                onChange={setCategory}
                            />

                            {/* Utilities Sub-Category */}
                            {category === '水道光熱費' && (
                                <div style={{ marginTop: '10px' }}>
                                    <SelectControl
                                        label="補助科目 (Sub-Category)"
                                        value={subCategory}
                                        options={[
                                            { label: '選択してください...', value: '' },
                                            { label: '電気代', value: '電気代' },
                                            { label: '水道代', value: '水道代' },
                                            { label: 'ガス代', value: 'ガス代' },
                                            { label: 'その他', value: 'その他' },
                                        ]}
                                        onChange={setSubCategory}
                                    />
                                </div>
                            )}

                            {/* Inventory Toggle */}
                            {category === '仕入高' && (
                                <div style={{ marginTop: '15px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px' }}>
                                    <ToggleControl
                                        label="在庫管理に連動する"
                                        checked={addToInventory}
                                        onChange={setAddToInventory}
                                    />
                                    {addToInventory && (
                                        <div className="form-row-2" style={{ marginTop: '10px' }}>
                                            <TextControl
                                                label="品名・品種"
                                                value={inventoryItemName}
                                                onChange={setInventoryItemName}
                                            />
                                            <TextControl
                                                label="数量"
                                                type="number"
                                                value={inventoryQty}
                                                onChange={setInventoryQty}
                                                min={1}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CARD 2: FINANCIALS */}
                    <div className="form-card">
                        <div className="form-card-header">金額・決済</div>
                        <div className="form-card-body">
                            <div className="form-row-2">
                                <SelectControl
                                    label="決済方法"
                                    value={paymentSource}
                                    options={type === 'income' ? [
                                        { label: '選択...', value: '' },
                                        { label: 'ヤフオク (Yahoo)', value: 'yahoo' },
                                        { label: 'Stripe', value: 'stripe' },
                                        { label: '銀行振込', value: 'bank' },
                                        { label: '現金', value: 'cash' },
                                        { label: '未収 (売掛金)', value: 'none' },
                                    ] : [
                                        { label: '選択...', value: '' },
                                        { label: '現金', value: 'cash' },
                                        { label: '事業用カード', value: 'business_card' },
                                        { label: '個人/配偶者カード', value: 'private_card' },
                                        { label: '銀行振込', value: 'bank' },
                                        { label: '未払 (買掛金)', value: 'none' },
                                    ]}
                                    onChange={handleSourceChange}
                                />
                                <div className="amount-input-group">
                                    <TextControl
                                        label="金額 (税込)"
                                        type="number"
                                        value={amount}
                                        onChange={handleAmountChange}
                                    />
                                </div>
                            </div>

                            {isPlatformSale && amount > 0 && (
                                <div className="calc-box-modern">
                                    <div className="calc-row">
                                        <span className="calc-label">売上総額</span>
                                        <span className="calc-val">¥{Number(amount).toLocaleString()}</span>
                                    </div>
                                    <div className="calc-row">
                                        <span className="calc-label">- 手数料 ({feeRate === 0.036 ? '3.6%' : '10%'})</span>
                                        <span className="calc-val">- ¥{estimatedFee.toLocaleString()}</span>
                                    </div>
                                    {type === 'income' && shippingFee > 0 && (
                                        <div className="calc-row">
                                            <span className="calc-label">- 送料 (天引き)</span>
                                            <span className="calc-val">- ¥{Number(shippingFee).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="calc-row final">
                                        <span className="calc-label">= 入金予定額</span>
                                        <span className="calc-val">¥{Number(estimatedNet).toLocaleString()}</span>
                                    </div>

                                    {/* Embedded Shipping Input for Platform Sales */}
                                    <div className="shipping-input-embedded">
                                        <TextControl
                                            label="天引き送料 (Yahooおてがる配送など)"
                                            help="売上から天引きされる送料を入力（経費として自動計上されます）"
                                            type="number"
                                            value={shippingFee}
                                            onChange={setShippingFee}
                                            placeholder="0"
                                        />
                                    </div>

                                    {/* Fee Override Toggle */}
                                    {type === 'income' && (
                                        <div style={{ marginTop: '10px' }}>
                                            <details>
                                                <summary style={{ fontSize: '0.8rem', color: '#666', cursor: 'pointer' }}>手数料を手動調整</summary>
                                                <div style={{ marginTop: '5px' }}>
                                                    <TextControl
                                                        label="手数料 (手入力)"
                                                        value={fee}
                                                        onChange={setFee}
                                                        type="number"
                                                    />
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Warning for High Value */}
                            {type === 'expense' && amount >= 300000 && (
                                <div style={{ marginTop: '15px', padding: '10px', background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', fontSize: '0.9rem', borderRadius: '4px' }}>
                                    <strong>⚠️ 高額資産の可能性</strong><br />
                                    30万円以上の物品は「固定資産」として登録し、減価償却を行う必要があります。
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- RIGHT COLUMN: DETAILS & meta --- */}
                <div className="right-col">

                    {/* CARD 3: SETTLEMENT STATUS */}
                    <div className="form-card">
                        <div className="form-card-header">
                            決済ステータス
                            <span className={`status-badge ${status === 'settled' ? 'status-settled' : 'status-unsettled'}`}>
                                {status === 'settled' ? '決済済' : '未決済'}
                            </span>
                        </div>
                        <div className="form-card-body">
                            <ToggleControl
                                label={status === 'settled' ? "決済完了 (入金/支払済)" : "未決済 (売掛/買掛)"}
                                checked={status === 'settled'}
                                onChange={(checked) => {
                                    setStatus(checked ? 'settled' : 'unsettled');
                                    if (checked && !depositDate) setDepositDate(date);
                                }}
                            />
                            {status === 'settled' && (
                                <TextControl
                                    label="入金・支払日"
                                    type="date"
                                    value={depositDate}
                                    onChange={setDepositDate}
                                />
                            )}
                        </div>
                    </div>

                    {/* CARD 4: INVOICE / PARTNER */}
                    <div className="form-card">
                        <div className="form-card-header">取引先・インボイス</div>
                        <div className="form-card-body">
                            {/* ▼ 修正: list属性を追加し、datalistと連携 */}
                            <TextControl
                                label="取引先名"
                                value={partnerName}
                                onChange={setPartnerName}
                                placeholder="Amazon, 東電, 〇〇商店..."
                                list="partner-name-suggestions" // リストIDを指定
                                autoComplete="off"
                            />
                            {/* ▼ 追加: 候補リストの定義 */}
                            <datalist id="partner-name-suggestions">
                                {partnerSuggestions.map((name, index) => (
                                    <option key={index} value={name} />
                                ))}
                            </datalist>

                            <div className="form-row-2">
                                <TextControl
                                    label="インボイス番号"
                                    value={invoiceNo}
                                    onChange={setInvoiceNo}
                                />
                                <SelectControl
                                    label="税率"
                                    value={taxRate}
                                    options={[
                                        { label: '10% (標準)', value: '10' },
                                        { label: '8% (軽減)', value: '8' },
                                        { label: '0% (非課税/不課税)', value: '0' },
                                    ]}
                                    onChange={setTaxRate}
                                />
                            </div>
                        </div>
                    </div>

                    {/* CARD 5: DETAILS & FILES */}
                    <div className="form-card">
                        <div className="form-card-header">摘要・証憑</div>
                        <div className="form-card-body">
                            <TextareaControl
                                label="摘要 (メモ)"
                                value={description}
                                onChange={setDescription}
                                rows={3}
                            />

                            <hr style={{ margin: '15px 0', border: '0', borderTop: '1px solid #eee' }} />

                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>領収書・請求書 (アップロード)</label>

                            {/* ▼ 修正: ドラッグ&ドロップエリア + カメラスキャンボタン */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                                {/* ドロップエリア */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => document.getElementById('receipt-upload-input').click()}
                                    style={{
                                        flex: 1,
                                        border: isDragging ? '2px dashed #2271b1' : '1px dashed #cbd5e1',
                                        background: isDragging ? '#f0f9ff' : '#f8fafc',
                                        borderRadius: '4px',
                                        padding: '20px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }}
                                >
                                    <input
                                        id="receipt-upload-input"
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={(e) => e.target.files.length > 0 && setReceiptFile(e.target.files[0])}
                                        style={{ display: 'none' }}
                                    />

                                    {receiptFile ? (
                                        <div style={{ color: '#2271b1', fontWeight: 'bold' }}>
                                            <span style={{ marginRight: '5px', fontSize: '1.2em' }}>📄</span>
                                            {receiptFile.name}
                                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginTop: '4px', fontWeight: 'normal' }}>
                                                (クリックして変更)
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#646970' }}>
                                            <p style={{ margin: '0 0 5px', fontWeight: 600 }}>クリック または ドロップ</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem' }}>PDF, JPG, PNG</p>
                                        </div>
                                    )}
                                </div>

                                {/* カメラ起動ボタン */}
                                <Button
                                    isSecondary
                                    style={{ height: 'auto', flexDirection: 'column', padding: '0 15px' }}
                                    onClick={() => setIsScannerOpen(true)}
                                >
                                    <span style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📸</span>
                                    <span style={{ fontSize: '0.75rem' }}>カメラ起動</span>
                                </Button>
                            </div>

                            {/* ▼ 追加: スキャナーモーダル */}
                            {isScannerOpen && (
                                <Modal title="レシートスキャン (撮影・トリミング)" onRequestClose={() => setIsScannerOpen(false)}>
                                    <ReceiptScanner onSave={handleScanComplete} onCancel={() => setIsScannerOpen(false)} />
                                </Modal>
                            )}
                            {initialData && initialData.receipt_path && (
                                <p style={{ marginTop: '5px', fontSize: '0.8rem' }}>
                                    {(() => {
                                        // Use Proxy URL to bypass 403 Forbidden on Symlinks
                                        const cleanPath = initialData.receipt_path.replace('breeder-receipts/', '');
                                        const proxyUrl = `${window.breederAccountingSettings.ajaxUrl}?action=breeder_view_receipt&file=${cleanPath}`;
                                        return (
                                            <a href={proxyUrl} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#2563eb', fontWeight: 600 }}>
                                                📄 証憑を表示 (View Receipt)
                                            </a>
                                        );
                                    })()}
                                </p>
                            )}

                            {/* Compliance Check */}
                            {(() => {
                                const diffDays = Math.ceil(Math.abs(new Date() - new Date(date)) / (86400000));
                                if ((new Date() > new Date(date)) && diffDays > 70) {
                                    return (
                                        <div style={{ marginTop: '10px', color: '#e11d48', fontSize: '0.75rem' }}>
                                            ⚠️ 入力遅延 (70日以上経過): 電帳法の要件を満たさない可能性があります。
                                        </div>
                                    )
                                }
                            })()}

                        </div>
                    </div>

                    {/* Submit Button Area */}
                    <div style={{ marginTop: '20px' }}>
                        <Button
                            isPrimary
                            isLarge
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleSubmit}
                            isBusy={isSubmitting}
                        >
                            {isEditMode ? '更新する' : '保存する'}
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
};

// ▼ 新規追加: スキャナーコンポーネント
const ReceiptScanner = ({ onSave, onCancel }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [mode, setMode] = useState('camera'); // 'camera' | 'crop'
    const [imageSrc, setImageSrc] = useState(null);

    // Crop State
    const [cropRect, setCropRect] = useState(null); // {x, y, w, h}
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // 1. カメラ初期化
    useEffect(() => {
        if (mode === 'camera') {
            navigator.mediaDevices.enumerateDevices().then(devs => {
                const videoDevs = devs.filter(d => d.kind === 'videoinput');
                setDevices(videoDevs);
                if (videoDevs.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(videoDevs[0].deviceId);
                }
            });
        }
        return () => stopStream();
    }, [mode]);

    useEffect(() => {
        if (mode === 'camera' && selectedDeviceId) {
            startStream(selectedDeviceId);
        }
    }, [selectedDeviceId, mode]);

    const startStream = (deviceId) => {
        stopStream();
        navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        }).then(s => {
            setStream(s);
            if (videoRef.current) videoRef.current.srcObject = s;
        }).catch(err => console.error("Camera Error:", err));
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const captureImage = () => {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setImageSrc(canvas.toDataURL('image/jpeg'));
        setMode('crop');
        stopStream();
        // 初期クロップ範囲（全体）
        setCropRect({ x: 50, y: 50, w: canvas.width - 100, h: canvas.height - 100 });
    };

    // 2. クロップロジック
    // 画像がロードされたらCanvasに描画
    useEffect(() => {
        if (mode === 'crop' && imageSrc && canvasRef.current) {
            drawCanvas();
        }
    }, [imageSrc, cropRect, mode]);

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            canvas.width = 600; // 表示幅固定
            const scale = 600 / img.width;
            canvas.height = img.height * scale;

            // 画像描画
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 暗いオーバーレイ
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // クロップエリアのクリア（明るくする）
            if (cropRect) {
                // 表示用スケール変換
                // cropRectは元の画像座標系で管理する想定だが、
                // 簡易化のためここでは「表示座標系」で管理し、保存時に変換する方がUI実装が楽。
                // 今回は「表示座標系」でstate管理します。

                ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
                ctx.drawImage(img,
                    cropRect.x / scale, cropRect.y / scale, cropRect.w / scale, cropRect.h / scale,
                    cropRect.x, cropRect.y, cropRect.w, cropRect.h
                );

                // 枠線
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            }
        };
    };

    // 自動トリミング（簡易版：中央付近の色差検出）
    const autoTrim = () => {
        // ※OpenCV等が使えないため、簡易的に「全体より少し小さく、コントラストがある部分」を探すか、
        // 実用的には「リセット」機能として動作させ、手動調整を促すのが安全です。
        // ここでは「画像の80%を中心に配置」するリセットを行います。
        const canvas = canvasRef.current;
        if (canvas) {
            const w = canvas.width;
            const h = canvas.height;
            setCropRect({ x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 });
        }
    };

    // マウスドラッグ操作（矩形描画）
    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setDragStart({ x, y });
        setIsDragging(true);
        setCropRect({ x, y, w: 0, h: 0 }); // 新しい矩形開始
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const w = currentX - dragStart.x;
        const h = currentY - dragStart.y;

        setCropRect({
            x: w > 0 ? dragStart.x : currentX,
            y: h > 0 ? dragStart.y : currentY,
            w: Math.abs(w),
            h: Math.abs(h)
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        // 小さすぎる場合は補正
        if (cropRect && (cropRect.w < 10 || cropRect.h < 10)) {
            autoTrim();
        }
    };

    const saveResult = () => {
        if (!cropRect || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const scale = (new Image().src = imageSrc).naturalWidth ? (imageSrc.width / canvas.width) : (canvas.width / 600); // 概算

        // 元画像から切り出し
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            const realScale = img.width / canvas.width;

            const outCanvas = document.createElement('canvas');
            outCanvas.width = cropRect.w * realScale;
            outCanvas.height = cropRect.h * realScale;
            const ctx = outCanvas.getContext('2d');

            ctx.drawImage(img,
                cropRect.x * realScale, cropRect.y * realScale, cropRect.w * realScale, cropRect.h * realScale,
                0, 0, outCanvas.width, outCanvas.height
            );

            outCanvas.toBlob((blob) => {
                const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
                onSave(file);
            }, 'image/jpeg', 0.9);
        };
    };

    return (
        <div style={{ minWidth: '300px', minHeight: '400px' }}>
            {mode === 'camera' && (
                <div>
                    <div style={{ marginBottom: '10px' }}>
                        <SelectControl
                            label="カメラ選択 (Macの場合はiPhoneを選択可能)"
                            value={selectedDeviceId}
                            options={devices.map(d => ({ label: d.label || `Camera ${d.deviceId.slice(0, 5)}`, value: d.deviceId }))}
                            onChange={setSelectedDeviceId}
                        />
                    </div>
                    <div style={{ background: '#000', borderRadius: '4px', overflow: 'hidden', textAlign: 'center' }}>
                        <video ref={videoRef} autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '400px' }} />
                    </div>
                    <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <Button isSecondary onClick={onCancel}>キャンセル</Button>
                        <Button isPrimary onClick={captureImage}>撮影する</Button>
                    </div>
                </div>
            )}

            {mode === 'crop' && (
                <div>
                    <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '8px' }}>
                        ドラッグして切り抜き範囲を指定してください。
                    </p>
                    <div style={{ textAlign: 'center', background: '#333', padding: '10px', overflow: 'auto' }}>
                        <canvas
                            ref={canvasRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            style={{ cursor: 'crosshair', maxWidth: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between' }}>
                        <Button isSecondary onClick={() => setMode('camera')}>再撮影</Button>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button isSecondary onClick={autoTrim}>範囲リセット</Button>
                            <Button isPrimary onClick={saveResult}>保存する</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionForm;
