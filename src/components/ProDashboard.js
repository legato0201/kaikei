import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Spinner, Card, CardBody, CardHeader, SelectControl } from '@wordpress/components';

const ProDashboard = ({ refreshTrigger }) => {
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());

    useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/breeder/v1/summary?year=${year}` })
            .then((data) => {
                setStats(data);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setIsLoading(false);
            });
    }, [refreshTrigger, year]);

    if (isLoading) return <div className="pro-loading"><Spinner /></div>;
    if (!stats) return null;

    return (
        <div className="pro-dashboard">
            <div className="pro-header">
                <h2>財務概況 (Financial Overview)</h2>
                <div className="year-selector">
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
            </div>

            <div className="kpi-grid">
                <div className="kpi-card income">
                    <span className="label">総売上 ({year})</span>
                    <span className="value">¥{stats.income.toLocaleString()}</span>
                    <span className="sub">Gross Sales (税込)</span>
                </div>
                <div className="kpi-card expenses">
                    <span className="label">総経費 ({year})</span>
                    <span className="value">¥{stats.expenses.toLocaleString()}</span>
                    <span className="sub">Deductible Expenses</span>
                </div>
                <div className="kpi-card profit">
                    <span className="label">純利益 ({year})</span>
                    <span className="value">¥{stats.profit.toLocaleString()}</span>
                    <span className="sub">Net Profit</span>
                </div>
                <div className="kpi-card tax">
                    <span className="label">消費税・試算</span>
                    <span className="value">¥{stats.tax_liability.toLocaleString()}</span>
                    <span className="sub">Est. Tax (10%)</span>
                </div>
            </div>

            {/* Receivables Monitor */}
            {/* Receivables Monitor */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#374151' }}>未回収残高 (Outstanding Receivables)</h3>
            <div className="receivables-grid">
                <div className="kpi-card receivable-card stripe">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="label">Stripe</span>
                        <span className="tag-brand">Stripe</span>
                    </div>
                    <span className="value">¥{stats.receivables.stripe.toLocaleString()}</span>
                    <span className="sub">売掛金残高</span>
                </div>
                <div className="kpi-card receivable-card yahoo">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="label">Yahoo (未入金)</span>
                        <span className="tag-brand">Yahoo</span>
                    </div>
                    <span className="value">¥{stats.receivables.yahoo.toLocaleString()}</span>
                    <span className="sub">売掛金残高</span>
                </div>
                <div className="kpi-card receivable-card total">
                    <span className="label">未回収合計</span>
                    <span className="value">¥{stats.receivables.total.toLocaleString()}</span>
                    <span className="sub">キャッシュフロー予定</span>
                </div>
            </div>

            <style>{`
                .pro-dashboard { padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; }
                .pro-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
                .kpi-grid, .receivables-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 2rem; }
                .kpi-card { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #f0f0f0; display: flex; flex-direction: column; }
                .kpi-card .label { font-size: 0.85rem; color: #6b7280; margin-bottom: 8px; font-weight: 500; }
                .kpi-card .value { font-size: 1.8rem; font-weight: 700; color: #111827; letter-spacing: -0.02em; }
                .kpi-card .sub { font-size: 0.75rem; color: #9ca3af; margin-top: auto; padding-top: 12px; }
                .kpi-card.income .value { color: #059669; }
                .kpi-card.expenses .value { color: #dc2626; }
                .kpi-card.profit .value { color: #2563eb; }
                .kpi-card.tax { background: #f8fafc; border: 1px dashed #cbd5e1; }
                
                .receivable-card.stripe { border-left: 4px solid #635bff; }
                .receivable-card.yahoo { border-left: 4px solid #ff0033; }
                .receivable-card.total { background: #fdfdfd; border: 1px solid #e5e7eb; }
                .receivable-card .value { color: #d97706; } /* Amber for pending */
                .tag-brand { font-size: 0.7rem; background: #eee; padding: 2px 6px; border-radius: 4px; }
            `}</style>
        </div>
    );
};

export default ProDashboard;
