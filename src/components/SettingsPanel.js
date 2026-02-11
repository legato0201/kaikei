import { useState, useEffect } from '@wordpress/element';
import { Card, CardBody, CardHeader, TextControl, Button, Spinner, TabPanel, SelectControl, CheckboxControl } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

// --- Tab Components ---

const BasicProfileTab = ({ data, onChange }) => (
    <div style={{ marginTop: '20px' }}>
        <h3>事業主・基本情報 (Basic Profile)</h3>
        <p className="description">請求書や確定申告書のヘッダー、PDF出力等に使用されます。</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <TextControl label="氏名 (事業主名)" value={data.profile.owner_name} onChange={(v) => onChange('owner_name', v)} />
            <TextControl label="フリガナ" value={data.profile.owner_kana} onChange={(v) => onChange('owner_kana', v)} />

            <TextControl label="屋号" value={data.profile.store_name} onChange={(v) => onChange('store_name', v)} />
            <TextControl label="生年月日" type="date" value={data.profile.birth_date} onChange={(v) => onChange('birth_date', v)} />

            <TextControl label="電話番号" value={data.profile.phone_number} onChange={(v) => onChange('phone_number', v)} />
            <TextControl label="職業" value={data.profile.occupation} onChange={(v) => onChange('occupation', v)} help="例: プログラマー、ブリーダー" />

            <div style={{ gridColumn: '1 / -1' }}>
                <TextControl label="住所 (納税地)" value={data.profile.address_tax} onChange={(v) => onChange('address_tax', v)} />
                <TextControl label="事業所住所" value={data.profile.address_office} onChange={(v) => onChange('address_office', v)} help="納税地と異なる場合のみ入力" />
            </div>

            <TextControl label="所轄税務署" value={data.profile.tax_office} onChange={(v) => onChange('tax_office', v)} />
            <TextControl label="業種" value={data.profile.industry_type} onChange={(v) => onChange('industry_type', v)} />
        </div>
    </div>
);

const TaxSettingsTab = ({ selectedYear, onYearChange, getTaxValue, onChange }) => (
    <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
            <h3>申告・年度設定 (Tax Settings)</h3>
            <SelectControl
                label="対象年度"
                labelPosition="side"
                value={selectedYear}
                options={[2023, 2024, 2025, 2026, 2027].map(y => ({ label: `${y}年`, value: y.toString() }))}
                onChange={(v) => onYearChange(v)}
                style={{ width: '100px' }}
            />
        </div>

        <Card>
            <CardBody>
                <SelectControl
                    label="Blue Return Deduction / 青色申告特別控除"
                    value={getTaxValue('deduction_amount', '650000')}
                    options={[
                        { label: '650,000円 (e-Tax)', value: '650000' },
                        { label: '550,000円', value: '550000' },
                        { label: '100,000円', value: '100000' },
                        { label: 'None (White Return) / 無し（白色）', value: '0' },
                    ]}
                    onChange={(v) => onChange(selectedYear, 'deduction_amount', v)}
                />

                <SelectControl
                    label="Consumer Tax Status / 消費税課税事業者"
                    value={getTaxValue('is_taxable_person', 'no')}
                    options={[
                        { label: 'Tax Exempt / 免税事業者', value: 'no' },
                        { label: 'Taxable Person / 課税事業者', value: 'yes' },
                    ]}
                    onChange={(v) => onChange(selectedYear, 'is_taxable_person', v)}
                />

                {getTaxValue('is_taxable_person') === 'yes' && (
                    <div style={{ marginLeft: '20px', padding: '10px', background: '#f0f0f0', borderLeft: '4px solid #ccc' }}>
                        <SelectControl
                            label="Tax Calculation Method / 課税方式"
                            value={getTaxValue('tax_calc_method', 'general')}
                            options={[
                                { label: 'General (本則課税)', value: 'general' },
                                { label: 'Simplified (簡易課税)', value: 'simplified' },
                                { label: '20% Special Rule (2割特例)', value: 'special_20' },
                            ]}
                            onChange={(v) => onChange(selectedYear, 'tax_calc_method', v)}
                        />
                        {getTaxValue('tax_calc_method') === 'simplified' && (
                            <SelectControl
                                label="Business Category (Deemed Purchase Rate) / みなし仕入率"
                                value={getTaxValue('deemed_purchase_rate', 'type5')}
                                options={[
                                    { label: 'Type 1 (Wholesale) / 第1種 (90%)', value: 'type1' },
                                    { label: 'Type 2 (Retail) / 第2種 (80%)', value: 'type2' },
                                    { label: 'Type 3 (Manufacturing) / 第3種 (70%)', value: 'type3' },
                                    { label: 'Type 4 (Other) / 第4種 (60%)', value: 'type4' },
                                    { label: 'Type 5 (Service) / 第5種 (50%)', value: 'type5' },
                                    { label: 'Type 6 (Real Estate) / 第6種 (40%)', value: 'type6' },
                                ]}
                                onChange={(v) => onChange(selectedYear, 'deemed_purchase_rate', v)}
                            />
                        )}
                    </div>
                )}
            </CardBody>
        </Card>
    </div>
);

const InvoiceTab = ({ data, onProfileChange, getTaxValue, onTaxChange, selectedYear }) => (
    <div style={{ marginTop: '20px' }}>
        <h3>インボイス制度設定</h3>
        <TextControl
            label="インボイス登録番号 (T番号)"
            value={data.profile.invoice_reg_number}
            onChange={(v) => onProfileChange('invoice_reg_number', v)}
            placeholder="T1234567890123"
            help="請求書や領収書に記載されます。"
        />
        <SelectControl
            label="Tax Accounting Method / 経理方式"
            value={getTaxValue('tax_accounting_method', 'tax_included')}
            options={[
                { label: 'Tax Included (税込経理)', value: 'tax_included' },
                { label: 'Tax Excluded (税抜経理)', value: 'tax_excluded' },
            ]}
            onChange={(v) => onTaxChange(selectedYear, 'tax_accounting_method', v)}
            help="For Blue Return with < 10M sales, Tax Included is common."
        />
    </div>
);



const OpeningBalancesTab = ({ data, onChange }) => {
    const balances = data?.opening_balances || {};
    const handleChange = (field, value) => {
        onChange('opening_balances', { ...balances, [field]: value });
    };

    return (
        <div style={{ marginTop: '20px' }}>
            <h3>Opening Balances (開始残高)</h3>
            <p className="description">
                Set these ONLY if you are migrating from another software. These values are added to the cumulative calculation from Year 1.<br />
                他ソフトからの移行時のみ入力してください。これらの値は初年度の「元入金」や「期首残高」として計算に含まれます。
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <Card>
                    <CardHeader style={{ background: '#ebf8ff', color: '#2b6cb0', fontWeight: 'bold' }}>Assets (資産)</CardHeader>
                    <CardBody>
                        <TextControl label="現金" value={balances.cash} onChange={(v) => handleChange('cash', v)} type="number" />
                        <TextControl label="普通預金" value={balances.deposits} onChange={(v) => handleChange('deposits', v)} type="number" help="期首の銀行預金残高。" />
                        <TextControl label="売掛金" value={balances.receivables} onChange={(v) => handleChange('receivables', v)} type="number" help="期首の未回収売上。" />
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader style={{ background: '#fff5f5', color: '#c53030', fontWeight: 'bold' }}>負債・資本 (Liabilities & Equity)</CardHeader>
                    <CardBody>
                        <TextControl label="未払金" value={balances.payables} onChange={(v) => handleChange('payables', v)} type="number" help="期首の未払経費等の残高。" />
                        <TextControl label="事業主借" value={balances.borrowings} onChange={(v) => handleChange('borrowings', v)} type="number" help="前年までの事業主借の累積。" />
                        <TextControl label="元入金" value={balances.capital} onChange={(v) => handleChange('capital', v)} type="number" help="開業時または年初の元入金。" />
                    </CardBody>
                </Card>
            </div>
        </div>
    );
};

const FamilyDependentsTab = ({ selectedYear, getTaxValue, onChange }) => (
    <div style={{ marginTop: '20px' }}>
        <h3>Family & Dependents (家族・専従者)</h3>

        <Card style={{ marginBottom: '20px' }}>
            <CardHeader>Blue Return Family Employees (青色事業専従者)</CardHeader>
            <CardBody>
                <p className="description">Relevant for Blue Return Page 2 (Wages). / 青色申告決算書（2ページ目）の専従者給与用。</p>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <TextControl
                        label="Name / 氏名"
                        value={getTaxValue('family_employee_name')}
                        onChange={(v) => onChange(selectedYear, 'family_employee_name', v)}
                    />
                    <SelectControl
                        label="Work Months / 従事月数"
                        value={getTaxValue('family_employee_months', '12')}
                        options={[...Array(13).keys()].slice(1).map(m => ({ label: `${m} months`, value: `${m}` }))}
                        onChange={(v) => onChange(selectedYear, 'family_employee_months', v)}
                    />
                </div>
            </CardBody>
        </Card>

        <Card>
            <CardHeader>Spouse & Dependents (配偶者・扶養親族)</CardHeader>
            <CardBody>
                <p className="description">Relevant for Tax Return Form B (Deductions). / 確定申告書B（控除）用。</p>
                <CheckboxControl
                    label="Has Spouse (配偶者あり)"
                    checked={getTaxValue('has_spouse') === '1'}
                    onChange={(v) => onChange(selectedYear, 'has_spouse', v ? '1' : '0')}
                />
                {getTaxValue('has_spouse') === '1' && (
                    <TextControl
                        label="Spouse Name / 配偶者氏名"
                        value={getTaxValue('spouse_name')}
                        onChange={(v) => onChange(selectedYear, 'spouse_name', v)}
                    />
                )}

                <TextControl
                    label="Number of Dependents / 扶養親族の人数"
                    type="number"
                    value={getTaxValue('dependent_count', '0')}
                    onChange={(v) => onChange(selectedYear, 'dependent_count', v)}
                />
            </CardBody>
        </Card>
    </div>
);

const MaintenanceTab = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // Backup Handler
    const handleBackup = async () => {
        setIsProcessing(true);
        setStatusMsg('バックアップを生成中...');
        try {
            const data = await apiFetch({ path: '/breeder/v1/backup' });
            // Download as JSON
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `breeder_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setStatusMsg('バックアップファイルのダウンロードが完了しました。');
        } catch (err) {
            console.error(err);
            setStatusMsg('バックアップ生成エラー。');
        } finally {
            setIsProcessing(false);
        }
    };

    // Restore Handler
    const handleRestore = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm('警告: 現在のデータをバックアップファイルの内容で上書きします。よろしいですか？')) {
            event.target.value = null; // Reset
            return;
        }

        setIsProcessing(true);
        setStatusMsg('データを復元中...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                // Validate minimal structure
                if (!json.tables) throw new Error('Invalid backup file format.');

                await apiFetch({
                    path: '/breeder/v1/restore',
                    method: 'POST',
                    data: json
                });
                setStatusMsg('データ復元に成功しました。ページをリロードしてください。');
                alert('データ復元に成功しました。ページをリロードします。');
                window.location.reload();
            } catch (err) {
                console.error(err);
                setStatusMsg('復元エラー: ' + err.message);
                alert('データの復元に失敗しました。');
            } finally {
                setIsProcessing(false);
                event.target.value = null;
            }
        };
        reader.readAsText(file);
    };

    // Reset Handler
    const handleReset = async () => {
        if (!confirm('【危険】全ての取引データ、在庫データ、設定を永久に削除します。この操作は取り消せません。本当によろしいですか？')) {
            return;
        }
        // Double confirm
        if (!confirm('最終確認: 全データを削除してもよろしいですか？')) return;

        setIsProcessing(true);
        try {
            await apiFetch({ path: '/breeder/v1/reset', method: 'POST' });
            setStatusMsg('全ての再大を削除しました (初期化完了)');
            alert('初期化が完了しました。ページをリロードします。');
            window.location.reload();
        } catch (err) {
            console.error(err);
            setStatusMsg('初期化エラーが発生しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ marginTop: '20px' }}>
            <h3>Data Management (データ管理)</h3>
            <p style={{ color: '#666' }}>Export your data for backup, or restore from a previously saved file.</p>

            {statusMsg && <div style={{ padding: '10px', background: '#eef', marginBottom: '15px', borderRadius: '4px' }}>{statusMsg}</div>}

            <Card style={{ marginBottom: '20px' }}>
                <CardBody>
                    <h4>バックアップ (Export)</h4>
                    <p>全ての取引、在庫、設定データをJSONファイルとしてダウンロードします。</p>
                    <Button isSecondary onClick={handleBackup} isBusy={isProcessing} disabled={isProcessing}>
                        バックアップをダウンロード
                    </Button>
                </CardBody>
            </Card>

            <Card style={{ marginBottom: '20px' }}>
                <CardBody>
                    <h4>復元 (Import)</h4>
                    <p>バックアップファイル(.json)からデータを復元します。<strong>注意: 現在のデータは上書きされます。</strong></p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleRestore}
                            disabled={isProcessing}
                            style={{ padding: '5px' }}
                        />
                        {isProcessing && <Spinner />}
                    </div>
                </CardBody>
            </Card>

            <Card style={{ borderColor: '#d63638' }}>
                <CardBody>
                    <h4 style={{ color: '#d63638' }}>データ初期化 (Danger Zone)</h4>
                    <p>全てのデータを完全に削除します。この操作は取り消せません。</p>
                    <Button isDestructive onClick={handleReset} isBusy={isProcessing} disabled={isProcessing}>
                        全データを削除する
                    </Button>
                </CardBody>
            </Card>
        </div>
    );
};

const SettingsPanel = () => {
    const [data, setData] = useState(null); // { profile, tax_history, opening_balances }
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

    // Fetch initial data
    useEffect(() => {
        apiFetch({ path: '/breeder/v1/settings' })
            .then((response) => {
                setData(response);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setIsLoading(false);
            });
    }, []);

    const handleProfileChange = (field, value) => {
        setData(prev => ({
            ...prev,
            profile: { ...prev.profile, [field]: value }
        }));
    };

    const handleTaxHistoryChange = (year, field, value) => {
        setData(prev => ({
            ...prev,
            tax_history: {
                ...prev.tax_history,
                [year]: {
                    ...(prev.tax_history?.[year] || {}),
                    [field]: value
                }
            }
        }));
    };

    // Helper to get safe value for current year
    const getTaxValue = (field, defaultVal = '') => {
        return data?.tax_history?.[selectedYear]?.[field] ?? defaultVal;
    };

    const handleSave = () => {
        setIsSaving(true);
        apiFetch({
            path: '/breeder/v1/settings',
            method: 'POST',
            data: data
        })
            .then((response) => {
                setData(response); // Update with server response
                setIsSaving(false);
                setMessage('設定を保存しました。');
                setTimeout(() => setMessage(''), 3000);
            })
            .catch((error) => {
                console.error(error);
                setIsSaving(false);
                setMessage('設定の保存中にエラーが発生しました。');
            });
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="breeder-settings-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>システム設定</h2>
                <Button isPrimary isBusy={isSaving} onClick={handleSave}>変更を保存</Button>
            </div>

            {message && (
                <div className="updated notice" style={{ marginBottom: '15px', borderLeft: '4px solid #46b450' }}>
                    <p>{message}</p>
                </div>
            )}

            <TabPanel
                className="breeder-settings-tabs"
                activeClass="is-active"
                tabs={[
                    { name: 'profile', title: '基本情報', className: 'tab-profile' },
                    { name: 'tax', title: '申告設定', className: 'tab-tax' },
                    { name: 'invoice', title: 'インボイス', className: 'tab-invoice' },
                    { name: 'opening', title: '開始残高', className: 'tab-opening' },
                    { name: 'family', title: '家族・専従者', className: 'tab-family' },
                    { name: 'maintenance', title: 'データ管理', className: 'tab-maintenance' },
                ]}
            >
                {(tab) => {
                    if (tab.name === 'profile') return (
                        <BasicProfileTab
                            data={data}
                            onChange={handleProfileChange}
                        />
                    );
                    if (tab.name === 'tax') return (
                        <TaxSettingsTab
                            selectedYear={selectedYear}
                            onYearChange={setSelectedYear}
                            getTaxValue={getTaxValue}
                            onChange={handleTaxHistoryChange}
                        />
                    );
                    if (tab.name === 'invoice') return (
                        <InvoiceTab
                            data={data}
                            onProfileChange={handleProfileChange}
                            getTaxValue={getTaxValue}
                            onTaxChange={handleTaxHistoryChange}
                            selectedYear={selectedYear}
                        />
                    );
                    if (tab.name === 'opening') return (
                        <OpeningBalancesTab
                            data={data}
                            onChange={(field, val) => setData(prev => ({ ...prev, [field]: val }))}
                        />
                    );
                    if (tab.name === 'family') return (
                        <FamilyDependentsTab
                            selectedYear={selectedYear}
                            getTaxValue={getTaxValue}
                            onChange={handleTaxHistoryChange}
                        />
                    );
                    if (tab.name === 'maintenance') return <MaintenanceTab />;
                    return null;
                }}
            </TabPanel>
        </div>
    );
};
export default SettingsPanel;

// End of component
