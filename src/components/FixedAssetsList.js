import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Button, Modal, TextControl, SelectControl, TextareaControl, Spinner } from '@wordpress/components';

import AccountingPDFButton from './pdf/AccountingPDF.js';

const FixedAssetsList = () => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);

    // Form Fields
    const [name, setName] = useState('');
    const [purchaseDate, setPurchaseDate] = useState('');
    const [serviceDate, setServiceDate] = useState('');
    const [purchasePrice, setPurchasePrice] = useState('');
    const [lifespanYears, setLifespanYears] = useState('4');
    const [method, setMethod] = useState('STRAIGHT_LINE');
    const [businessRatio, setBusinessRatio] = useState('100');
    const [notes, setNotes] = useState('');
    const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
    const [disposeItem, setDisposeItem] = useState(null);
    const [disposeDate, setDisposeDate] = useState('');
    const [disposeType, setDisposeType] = useState('SCRAP');
    const [disposeNote, setDisposeNote] = useState('');

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteItem, setDeleteItem] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = () => {
        setIsLoading(true);
        apiFetch({ path: '/breeder/v1/assets' }).then(res => {
            setItems(res.items || []);
            setIsLoading(false);
        });
    };

    const handleOpenModal = (item = null) => {
        setEditItem(item);
        if (item) {
            setName(item.name);
            setPurchaseDate(item.purchase_date);
            setServiceDate(item.service_date || item.purchase_date);
            setPurchasePrice(item.purchase_price);
            setLifespanYears(item.lifespan_years);
            setMethod(item.method);
            setBusinessRatio(item.business_ratio || '100');
            setNotes(item.notes);
        } else {
            setName('');
            setPurchaseDate(new Date().toISOString().split('T')[0]);
            setServiceDate(new Date().toISOString().split('T')[0]);
            setPurchasePrice('');
            setLifespanYears('4');
            setMethod('STRAIGHT_LINE');
            setBusinessRatio('100');
            setNotes('');
        }
        setIsModalOpen(true);
    };

    const handleOpenDisposeModal = (item) => {
        setDisposeItem(item);
        setDisposeDate(new Date().toISOString().split('T')[0]);
        setDisposeType('SCRAP');
        setDisposeNote('');
        setIsDisposeModalOpen(true);
    };

    const handleOpenDeleteModal = (item) => {
        setDeleteItem(item);
        setIsDeleteModalOpen(true);
    };

    const handleSubmit = () => {
        const path = editItem ? `/breeder/v1/assets/${editItem.id}` : '/breeder/v1/assets';
        const methodType = editItem ? 'PUT' : 'POST';

        apiFetch({
            path,
            method: methodType,
            data: {
                name,
                purchase_date: purchaseDate,
                service_date: serviceDate,
                purchase_price: purchasePrice,
                lifespan_years: lifespanYears,
                method: method,
                business_ratio: businessRatio,
                notes
            }
        }).then(() => {
            setIsModalOpen(false);
            fetchData();
        }).catch(err => {
            alert(err.message);
        });
    };

    const handleDispose = () => {
        if (!disposeItem) return;

        // Validation: confirm date is not before purchase date?
        // Let backend handle detailed logic or just trust user.

        apiFetch({
            path: `/breeder/v1/assets/${disposeItem.id}/dispose`,
            method: 'POST',
            data: {
                date: disposeDate,
                type: disposeType,
                note: disposeNote
            }
        }).then(() => {
            setIsDisposeModalOpen(false);
            fetchData();
            alert('Asset disposed and journal entries created.');
        }).catch(err => {
            alert(err.message);
        });
    };

    const handleDelete = () => {
        if (!deleteItem) return;

        apiFetch({ path: `/breeder/v1/assets/${deleteItem.id}`, method: 'DELETE' })
            .then(() => {
                setIsDeleteModalOpen(false);
                fetchData();
            })
            .catch(err => alert(err.message));
    };

    // Straight-Line Depreciation Calculation with Monthly Proration
    const calculateDepreciation = (price, years, date, method, ratio = 100) => {
        const cost = Number(price);
        const assetLife = Number(years);
        const businessRatio = (ratio === undefined || ratio === null || ratio === '') ? 1.0 : Number(ratio) / 100;

        if (isNaN(cost) || isNaN(assetLife) || isNaN(businessRatio)) {
            return { current: 0, depreciation: 0, fullDepreciation: 0 };
        }

        if (method === 'ONE_TIME') {
            const expense = Math.floor(cost * businessRatio);
            return { current: 1, depreciation: expense, fullDepreciation: cost }; // Instant write-off
        }

        const purchaseDateObj = new Date(date);
        const purchaseYear = purchaseDateObj.getFullYear();
        const purchaseMonth = purchaseDateObj.getMonth() + 1; // 1-indexed

        // This view is always "Current Status" (Today/This Year)
        const currentYear = new Date().getFullYear();

        // 1. Calculate Full Yearly Depreciation
        const yearlyDepFull = Math.floor(cost / years);

        // 2. Logic to calculate "This Year's Depreciation"
        let applicableMonths = 12;
        let isActive = true;

        if (currentYear < purchaseYear) {
            // Future asset?
            return { current: cost, depreciation: 0, fullDepreciation: 0 };
        }

        if (currentYear === purchaseYear) {
            // First Year: Prorate
            applicableMonths = 12 - purchaseMonth + 1;
        }

        // Calculate Accumulated Depreciation up to LAST year
        let accumulatedPrior = 0;
        if (currentYear > purchaseYear) {
            // First year (prorated)
            const firstYearMonths = 12 - purchaseMonth + 1;
            const firstYearDep = Math.floor(yearlyDepFull * firstYearMonths / 12);
            accumulatedPrior += firstYearDep;

            // Middle years
            const fullYearsPassed = currentYear - purchaseYear - 1;
            if (fullYearsPassed > 0) {
                accumulatedPrior += (yearlyDepFull * fullYearsPassed);
            }
        }

        // Check if already fully depreciated
        if (accumulatedPrior >= cost - 1) {
            // Already done
            return { current: 1, depreciation: 0, fullDepreciation: 0 };
        }

        // Calculate THIS year's full depreciation
        let thisYearDepFull = Math.floor(yearlyDepFull * applicableMonths / 12);

        // Cap at Remaining Book Value (leaving 1 yen)
        const remainingBook = cost - accumulatedPrior;
        if (remainingBook - thisYearDepFull < 1) {
            thisYearDepFull = remainingBook - 1;
        }

        if (thisYearDepFull < 0) thisYearDepFull = 0;

        // Apply Business Ratio
        const thisYearDepAllowable = Math.floor(thisYearDepFull * businessRatio);

        // Current Book Value (End of THIS year)
        const currentBookValue = Math.max(1, cost - accumulatedPrior - thisYearDepFull);

        return { current: currentBookValue, depreciation: thisYearDepAllowable, fullDepreciation: thisYearDepFull };
    };

    return (
        <div className="assets-manager">
            <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>固定資産台帳 (Fixed Assets)</h2>
                    <AccountingPDFButton
                        type="assets"
                        data={items}
                        config={{
                            period: `As of Dec 31, ${new Date().getFullYear()}`,
                        }}
                        buttonLabel="PDF出力 (台帳)"
                    />
                </div>
                <Button isPrimary onClick={() => handleOpenModal(null)}>+ 資産を追加</Button>
            </div>

            <div style={{ padding: '20px' }}>
                <div className="notice-box" style={{ marginBottom: '20px', padding: '15px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '0.9rem' }}>
                    <strong>💡 減価償却のルール (青色申告):</strong>
                    <ul style={{ margin: '5px 0 0 20px', listStyle: 'disc' }}>
                        <li>&lt; 30万円: 特例で全額即時償却できます (少額減価償却資産)。</li>
                        <li>&gt;= 30万円: 耐用年数に応じて定額償却が必要です。</li>
                    </ul>
                </div>

                {isLoading ? <Spinner /> : (
                    <table className="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Acquired</th>
                                <th>Cost (取得価額)</th>
                                <th>Life (年)</th>
                                <th>Method</th>
                                <th>Ratio</th>
                                <th>Book Value (現在簿価)</th>
                                <th>Next Expense (経費繰入)</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const val = calculateDepreciation(item.purchase_price, item.lifespan_years, item.service_date || item.purchase_date, item.method, item.business_ratio);
                                const isDisposed = item.status === 'DISPOSED';
                                return (
                                    <tr key={item.id} style={isDisposed ? { opacity: 0.6, background: '#f8f8f8' } : {}}>
                                        <td>
                                            <strong>{item.name}</strong>
                                            {isDisposed && <span style={{ marginLeft: '5px', padding: '2px 5px', fontSize: '0.7em', background: '#e5e7eb', borderRadius: '4px' }}>DISPOSED</span>}
                                        </td>
                                        <td>{item.purchase_date}</td>
                                        <td>¥{Number(item.purchase_price).toLocaleString()}</td>
                                        <td>{item.lifespan_years} yr</td>
                                        <td>{item.method === 'ONE_TIME' ? 'One-Time (特例)' : 'Straight-Line (定額)'}</td>
                                        <td>{item.business_ratio || 100}%</td>
                                        <td>
                                            <strong>¥{isDisposed ? 0 : val.current.toLocaleString()}</strong>
                                        </td>
                                        <td>
                                            {!isDisposed && (
                                                <>
                                                    <strong>¥{val.depreciation.toLocaleString()}</strong>
                                                    {item.business_ratio && item.business_ratio < 100 && (
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                            (Full: ¥{val.fullDepreciation.toLocaleString()})
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                        <td>
                                            {!isDisposed && (
                                                <>
                                                    <Button isSmall isSecondary onClick={() => handleOpenModal(item)}>Edit</Button>
                                                    <Button isSmall isSecondary style={{ marginLeft: '5px' }} onClick={() => handleOpenDisposeModal(item)}>Dispose</Button>
                                                </>
                                            )}
                                            <Button isSmall isDestructive style={{ marginLeft: '5px' }} onClick={() => handleOpenDeleteModal(item)}>Del</Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <Modal title={editItem ? "資産の編集" : "新規固定資産の登録"} onRequestClose={() => setIsModalOpen(false)}>
                    <div style={{ padding: '20px', maxWidth: '500px' }}>
                        <TextControl label="Asset Name (資産名)" value={name} onChange={setName} placeholder="e.g. MacBook Pro M4" />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <TextControl label="Price (取得価額)" type="number" value={purchasePrice} onChange={setPurchasePrice} />
                            <TextControl label="Acquired (取得日)" type="date" value={purchaseDate} onChange={setPurchaseDate} />
                            <TextControl label="Service Start (供用開始日)" type="date" value={serviceDate} onChange={setServiceDate} help="Date used for Depreciation calculation." />
                        </div>

                        <SelectControl
                            label="Depreciation Method (償却方法)"
                            value={method}
                            options={[
                                { label: 'Straight-Line (定額法)', value: 'STRAIGHT_LINE' },
                                { label: 'One-Time Expense (即時償却/特例)', value: 'ONE_TIME' },
                            ]}
                            onChange={setMethod}
                            help="Use One-Time if price < 300,000 JPY (Blue Return Special)."
                        />

                        <TextControl
                            label="Business Use Ratio (%) (事業割合)"
                            type="number"
                            value={businessRatio}
                            onChange={(val) => setBusinessRatio(Number(val))}
                            min={0}
                            max={100}
                            help="If 100% business use, enter 100."
                        />

                        {method === 'STRAIGHT_LINE' && (
                            <SelectControl
                                label="Useful Life (耐用年数)"
                                value={lifespanYears}
                                options={[
                                    { label: '4 Years (PC/Server)', value: '4' },
                                    { label: '5 Years (Furniture/Tools)', value: '5' },
                                    { label: '8 Years (Metal Furniture)', value: '8' },
                                    { label: '10 Years (Premises/Facilities)', value: '10' },
                                    { label: '6 Years (Car)', value: '6' },
                                ]}
                                onChange={setLifespanYears}
                            />
                        )}

                        <TextareaControl label="Notes" value={notes} onChange={setNotes} />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                            <Button isSecondary onClick={() => setIsModalOpen(false)}>キャンセル</Button>
                            <Button isPrimary onClick={handleSubmit}>保存する</Button>
                        </div>
                    </div>
                </Modal>
            )}

            {isDisposeModalOpen && (
                <Modal title="Dispose Asset (資産の処分・除却)" onRequestClose={() => setIsDisposeModalOpen(false)}>
                    <div style={{ padding: '20px', maxWidth: '500px' }}>
                        <p>Generate Journal Entries for Depreciation (up to date) and Loss on Retirement.</p>

                        <div style={{ marginTop: '15px' }}>
                            <strong>Asset:</strong> {disposeItem?.name}
                        </div>

                        <div style={{ marginTop: '15px' }}>
                            <TextControl
                                label="Disposal Date (処分日)"
                                type="date"
                                value={disposeDate}
                                onChange={setDisposeDate}
                            />
                        </div>

                        <SelectControl
                            label="Type (区分)"
                            value={disposeType}
                            options={[
                                { label: 'Scrapped / Waste (廃棄・除却)', value: 'SCRAP' },
                                { label: 'Sold / Transferred (売却・譲渡)', value: 'SELL' },
                            ]}
                            onChange={setDisposeType}
                        />

                        {disposeType === 'SELL' && (
                            <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '15px' }}>
                                <strong>Note for Sales:</strong>
                                <br />Income from selling business assets is "Transfer Income" (譲渡所得), not Business Income.
                                <br />Please record the sales proceeding separately as <strong>"Owner Draw (事業主貸)"</strong> or receive it to a personal account.
                            </div>
                        )}

                        <TextareaControl label="Reason / Notes" value={disposeNote} onChange={setDisposeNote} placeholder="e.g. Broken screen" />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                            <Button isSecondary onClick={() => setIsDisposeModalOpen(false)}>Cancel</Button>
                            <Button isDestructive onClick={handleDispose}>Dispose (Generate JE)</Button>
                        </div>
                    </div>
                </Modal>
            )}

            {isDeleteModalOpen && (
                <Modal title="⚠️ Delete Asset (Mistake Correction)" onRequestClose={() => setIsDeleteModalOpen(false)}>
                    <div style={{ padding: '20px', maxWidth: '500px' }}>
                        <div style={{ color: '#dc2626', fontWeight: 'bold', marginBottom: '15px' }}>
                            Warning: Permanent Data Loss
                        </div>
                        <p>This action is for correcting <strong>entry mistakes</strong> (wrong duplication, etc).</p>
                        <p>It will:</p>
                        <ul style={{ listStyle: 'disc', marginLeft: '20px', marginBottom: '15px' }}>
                            <li>Delete this asset from the registry.</li>
                            <li>Delete ALL related auto-generated Journal Entries (Depreciation, Loss).</li>
                        </ul>
                        <p><strong>Do NOT use this if you simply threw away or sold user asset.</strong> Use "Dispose" instead.</p>

                        <div style={{ marginTop: '20px', padding: '10px', background: '#fee2e2', borderRadius: '4px' }}>
                            <strong>Asset:</strong> {deleteItem?.name}<br />
                            <strong>Cost:</strong> ¥{Number(deleteItem?.purchase_price).toLocaleString()}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                            <Button isSecondary onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                            <Button isDestructive onClick={handleDelete}>Permanently Delete</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default FixedAssetsList;
