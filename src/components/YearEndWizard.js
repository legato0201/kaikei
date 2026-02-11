import { useState, useEffect } from '@wordpress/element';
import { Button, Spinner, Notice, TextControl } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

const YearEndWizard = () => {
    const [step, setStep] = useState(1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    // Step 1: Snapshot Data
    const [snapshotResult, setSnapshotResult] = useState(null);

    // Step 2: Depreciation Data
    const [depreciationResult, setDepreciationResult] = useState(null);

    // Step 3: Apportionment Data
    const [ratios, setRatios] = useState({
        // Default flat categories
        '地代家賃': 0,
        '通信費': 0,
        '車両費': 0,
        // Sub-categories for Utilities
        '水道光熱費_電気代': 0,
        '水道光熱費_ガス代': 0,
        '水道光熱費_水道代': 0,
        '水道光熱費_その他': 0
    });
    const [apportionmentResult, setApportionmentResult] = useState(null);

    // Step 4: Lock
    const [locked, setLocked] = useState(false);

    // --- Actions ---

    const runSnapshot = () => {
        setLoading(true);
        setError(null);
        apiFetch({
            path: '/breeder/v1/year-end/snapshot',
            method: 'POST',
            data: { year, date: `${year}-12-31` }
        }).then(res => {
            setSnapshotResult(res);
            setLoading(false);
            setSuccessMsg('Snapshot Created & Journal Entries Posted!');
        }).catch(err => {
            setError(err.message);
            setLoading(false);
        });
    };

    const runDepreciation = () => {
        setLoading(true);
        setError(null);
        apiFetch({
            path: '/breeder/v1/year-end/depreciation',
            method: 'POST',
            data: { year, date: `${year}-12-31` }
        }).then(res => {
            setDepreciationResult(res);
            setLoading(false);
            setSuccessMsg(`Depreciation Calculated: ¥${(res.total || 0).toLocaleString()}`);
        }).catch(err => {
            setError(err.message);
            setLoading(false);
        });
    };

    const runApportionment = () => {
        setLoading(true);
        setError(null);
        apiFetch({
            path: '/breeder/v1/year-end/apportionment',
            method: 'POST',
            // Transform ratios state to API array format
            // e.g. { '水道光熱費_電気代': 50 } -> { category: '水道光熱費', sub_category: '電気代', ratio: 50 }
            data: {
                year,
                date: `${year}-12-31`,
                ratios: Object.keys(ratios).map(k => {
                    if (k.startsWith('水道光熱費_')) {
                        const sub = k.split('_')[1];
                        return { category: '水道光熱費', sub_category: sub, ratio: ratios[k] };
                    }
                    return { category: k, sub_category: '', ratio: ratios[k] };
                })
            }
        }).then(res => {
            setApportionmentResult(res);
            setLoading(false);
            setSuccessMsg('Apportionment Journal Entries Created!');
        }).catch(err => {
            setError(err.message);
            setLoading(false);
        });
    };

    const lockYear = () => {
        setLoading(true);
        setError(null);
        apiFetch({
            path: '/breeder/v1/year-end/lock',
            method: 'POST',
            data: { year }
        }).then(res => {
            setLocked(true);
            setLoading(false);
            setSuccessMsg(`Fiscal Year ${year} is now LOCKED.`);
        }).catch(err => {
            setError(err.message);
            setLoading(false);
        });
    };

    // --- Render Steps ---

    const renderStep1 = () => (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <h2 style={{ margin: 0 }}>Step 1: Inventory Snapshot (棚卸)</h2>
            </div>
            <div style={{ padding: '20px' }}>
                <p>This will calculate the total value of active inventory (Products & Supplies) and create the Closing Entry.</p>
                <p><strong>Journal Entry:</strong> Dr: Closing Stock / Cr: Inventory</p>

                {snapshotResult ? (
                    <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '4px', border: '1px solid #86efac' }}>
                        <p><strong>✅ Snapshot Complete</strong></p>
                        <p>Total Valuation: ¥{(snapshotResult.total_valuation || 0).toLocaleString()}</p>
                        <p>Entries Created: {(snapshotResult.entries || []).length}</p>
                        <Button isPrimary onClick={() => { setSuccessMsg(null); setStep(2); }}>次へ: 減価償却 &rarr;</Button>
                    </div>
                ) : (
                    <Button isPrimary onClick={runSnapshot} isBusy={loading}>棚卸を実行 (Snapshot)</Button>
                )}
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <h2 style={{ margin: 0 }}>Step 2: Depreciation (減価償却)</h2>
            </div>
            <div style={{ padding: '20px' }}>
                <p>現在登録されている全ての「固定資産」について、今年度分の減価償却費を計算し、経費に計上します。</p>
                <p><strong>自動仕訳:</strong> 借) 減価償却費 / 貸) 固定資産</p>

                {depreciationResult ? (
                    <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '4px', border: '1px solid #86efac' }}>
                        <p><strong>✅ Depreciation Posted</strong></p>
                        <p>Total Expense: ¥{(depreciationResult.total || 0).toLocaleString()}</p>
                        <p>Assets Processed: {(depreciationResult.entries || []).length}</p>
                        <Button isPrimary onClick={() => { setSuccessMsg(null); setStep(3); }}>Next: Apportionment &rarr;</Button>
                    </div>
                ) : (
                    <Button isPrimary onClick={runDepreciation} isBusy={loading}>Register Depreciation</Button>
                )}
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <h2 style={{ margin: 0 }}>Step 3: Household Apportionment (家事按分)</h2>
            </div>
            <div style={{ padding: '20px' }}>
                <p>家事関連費（自宅兼事務所の家賃など）の経費計上割合を入力してください。</p>
                <p>入力した「事業割合 (%)」の分だけ経費に残り、残りは「事業主貸」として経費から除外されます。</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <TextControl
                            label="Rent (地代家賃)"
                            type="number"
                            min="0" max="100"
                            value={ratios['地代家賃']}
                            onChange={(val) => setRatios({ ...ratios, '地代家賃': parseInt(val) || 0 })}
                        />
                        <TextControl
                            label="Communication (通信費)"
                            type="number"
                            min="0" max="100"
                            value={ratios['通信費']}
                            onChange={(val) => setRatios({ ...ratios, '通信費': parseInt(val) || 0 })}
                        />
                        <TextControl
                            label="Vehicle (車両費)"
                            type="number"
                            min="0" max="100"
                            value={ratios['車両費']}
                            onChange={(val) => setRatios({ ...ratios, '車両費': parseInt(val) || 0 })}
                        />
                    </div>

                    {/* Utilities Granular Section */}
                    <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#475569' }}>Utilities Breakdown (水道光熱費)</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <TextControl
                                label="Electricity (電気代)"
                                type="number"
                                min="0" max="100"
                                value={ratios['水道光熱費_電気代']}
                                onChange={(val) => setRatios({ ...ratios, '水道光熱費_電気代': parseInt(val) || 0 })}
                            />
                            <TextControl
                                label="Gas (ガス代)"
                                type="number"
                                min="0" max="100"
                                value={ratios['水道光熱費_ガス代']}
                                onChange={(val) => setRatios({ ...ratios, '水道光熱費_ガス代': parseInt(val) || 0 })}
                            />
                            <TextControl
                                label="Water (水道代)"
                                type="number"
                                min="0" max="100"
                                value={ratios['水道光熱費_水道代']}
                                onChange={(val) => setRatios({ ...ratios, '水道光熱費_水道代': parseInt(val) || 0 })}
                            />
                            <TextControl
                                label="Other (その他)"
                                type="number"
                                min="0" max="100"
                                value={ratios['水道光熱費_その他']}
                                onChange={(val) => setRatios({ ...ratios, '水道光熱費_その他': parseInt(val) || 0 })}
                            />
                        </div>
                    </div>
                </div>

                {apportionmentResult ? (
                    <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '4px', border: '1px solid #86efac' }}>
                        <p><strong>✅ Apportionment Posted</strong></p>
                        <ul>
                            {(apportionmentResult.entries || []).map((e, i) => (
                                <li key={i}>{e.category}: Reversed ¥{e.private_amount.toLocaleString()} (Private Portion)</li>
                            ))}
                        </ul>
                        <Button isPrimary onClick={() => { setSuccessMsg(null); setStep(4); }}>Next: Lock & Finish &rarr;</Button>
                    </div>
                ) : (
                    <Button isPrimary onClick={runApportionment} isBusy={loading}>Adjust Expenses</Button>
                )}
            </div>
        </div>
    );

    const renderStep4 = () => (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <h2 style={{ margin: 0 }}>Step 4: 年度締め (Lock Fiscal Year)</h2>
            </div>
            <div style={{ padding: '20px' }}>
                <p>{year}年度のデータを確定し、ロックします。ロック後は取引の追加や編集ができなくなります。</p>

                {locked ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <h1 style={{ fontSize: '3rem' }}>🎉</h1>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>決算処理が完了しました</h3>
                        <p>{year}年度はロックされました。</p>
                    </div>
                ) : (
                    <Button isDestructive onClick={lockYear} isBusy={loading}>{year}年度をロックして完了</Button>
                )}
            </div>
        </div>
    );

    return (
        <div className="year-end-wizard" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>年度末決算処理 (Year-End Closing) - {year}</h1>

            {/* Year Selector (Optional) */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <label style={{ marginRight: '10px' }}>Fiscal Year:</label>
                <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    style={{ padding: '5px', fontSize: '1rem', width: '80px' }}
                />
            </div>

            {error && <Notice status="error" onRemove={() => setError(null)}>{error}</Notice>}
            {successMsg && <Notice status="success" onRemove={() => setSuccessMsg(null)}>{successMsg}</Notice>}

            {/* Progress Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '2px', background: '#e5e7eb', zIndex: 0 }}></div>
                {[1, 2, 3, 4].map(s => (
                    <div key={s} style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: step >= s ? '#2271b1' : '#fff',
                        color: step >= s ? '#fff' : '#9ca3af',
                        border: '2px solid ' + (step >= s ? '#2271b1' : '#e5e7eb'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', zIndex: 1
                    }}>
                        {s}
                    </div>
                ))}
            </div>

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
        </div>
    );
};

export default YearEndWizard;
