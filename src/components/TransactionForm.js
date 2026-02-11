import { useState, useEffect } from '@wordpress/element';
import {
    Button,
    TextControl,
    SelectControl,
    TextareaControl,
    ToggleControl,
    Notice,
    Card,
    CardBody,
    CardHeader
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

                            {/* ▼ 修正: ドラッグ&ドロップエリアに変更 */}
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => document.getElementById('receipt-upload-input').click()}
                                style={{
                                    border: isDragging ? '2px dashed #2271b1' : '1px dashed #cbd5e1',
                                    background: isDragging ? '#f0f9ff' : '#f8fafc',
                                    borderRadius: '4px',
                                    padding: '20px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
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
                                        <p style={{ margin: '0 0 5px', fontWeight: 600 }}>クリック または ドラッグ&ドロップ</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem' }}>PDF, JPG, PNG (領収書など)</p>
                                    </div>
                                )}
                            </div>
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

export default TransactionForm;
