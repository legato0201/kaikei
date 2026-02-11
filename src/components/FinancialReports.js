import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { SelectControl, Spinner, Card, CardBody, CardHeader } from '@wordpress/components';
import { ETaxCSVButton } from './pdf/AccountingPDF';

const FinancialReports = ({ onDrillDown }) => {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [plData, setPlData] = useState(null);
    const [bsData, setBsData] = useState(null);
    const [monthlyData, setMonthlyData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [year]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [pl, bs, monthly] = await Promise.all([
                apiFetch({ path: `/breeder/v1/reports/pl?year=${year}` }),
                apiFetch({ path: `/breeder/v1/reports/bs?year=${year}` }),
                apiFetch({ path: `/breeder/v1/reports/monthly?year=${year}` })
            ]);
            setPlData(pl);
            setBsData(bs);
            setMonthlyData(monthly);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
    };

    if (isLoading) return <div style={{ padding: '20px' }}><Spinner /> Loading reports...</div>;
    if (!plData || !bsData) return <div style={{ padding: '20px' }}>Error loading data.</div>;

    return (
        <div className="financial-reports" style={{ paddingBottom: '50px' }}>
            <div className="reports-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#fff', padding: '20px', borderBottom: '1px solid #ddd' }}>
                <h2 style={{ margin: 0 }}>青色申告決算書控 (Financial Reports)</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <ETaxCSVButton year={year} type="PL" label="e-Tax P/L (CSV)" />
                    <ETaxCSVButton year={year} type="BS" label="e-Tax B/S (CSV)" />
                    <ETaxCSVButton year={year} type="MONTHLY" label="e-Tax Monthly (CSV)" />
                    <div style={{ width: '150px' }}>
                        <SelectControl
                            label="Fiscal Year"
                            labelPosition="side"
                            value={year}
                            options={[
                                { label: `${currentYear}`, value: currentYear },
                                { label: `${currentYear - 1}`, value: currentYear - 1 },
                                { label: `${currentYear - 2}`, value: currentYear - 2 },
                            ]}
                            onChange={(val) => setYear(parseInt(val))}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) minmax(300px, 1fr)', gap: '20px', padding: '0 20px' }}>
                {/* P/L Statement */}
                <div className="report-card" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <div style={{ background: '#f7fafc', padding: '15px', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        損益計算書 (P/L)
                    </div>
                    <div style={{ padding: '20px' }}>
                        <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#edf2f7', padding: '8px', fontSize: '0.9rem', color: '#4a5568' }}>Revenue (売上)</th></tr>
                                <tr>
                                    <td>Sales & Misc Income</td>
                                    <td className="amount">{formatCurrency(plData.revenue.total)}</td>
                                </tr>

                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#edf2f7', padding: '8px', fontSize: '0.9rem', color: '#4a5568' }}>COGS (売上原価)</th></tr>
                                <tr>
                                    <td>Opening Inventory (期首)</td>
                                    <td className="amount">{formatCurrency(plData.cogs.opening_inventory)}</td>
                                </tr>
                                <tr>
                                    <td>Purchases (仕入)</td>
                                    <td className="amount">+ {formatCurrency(plData.cogs.purchases)}</td>
                                </tr>
                                <tr>
                                    <td>Closing Inventory (期末)</td>
                                    <td className="amount">- {formatCurrency(plData.cogs.closing_inventory)}</td>
                                </tr>
                                <tr style={{ fontWeight: 'bold', borderTop: '1px solid #cbd5e0' }}>
                                    <td style={{ paddingTop: '5px' }}>売上原価 (Cost of Goods Sold)</td>
                                    <td className="amount" style={{ paddingTop: '5px' }}>{formatCurrency(plData.cogs.total)}</td>
                                </tr>

                                <tr className="summary-row" style={{ background: '#e6fffa' }}>
                                    <td style={{ padding: '10px' }}><strong>Gross Profit (売上総利益)</strong></td>
                                    <td className="amount" style={{ padding: '10px' }}><strong>{formatCurrency(plData.gross_profit)}</strong></td>
                                </tr>

                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#edf2f7', padding: '8px', fontSize: '0.9rem', color: '#4a5568' }}>Expenses (経費)</th></tr>
                                {Object.keys(plData.expenses.details).length === 0 && <tr><td colSpan="2" style={{ color: '#a0aec0', fontStyle: 'italic' }}>No expenses recorded.</td></tr>}
                                {Object.entries(plData.expenses.details).map(([cat, amt]) => (
                                    <tr
                                        key={cat}
                                        onClick={() => onDrillDown && onDrillDown({ category: cat })}
                                        style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f0fff4'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ color: '#2b6cb0', textDecoration: 'underline' }}>{cat}</td>
                                        <td className="amount">{formatCurrency(amt)}</td>
                                    </tr>
                                ))}
                                <tr style={{ fontWeight: 'bold', borderTop: '1px solid #cbd5e0' }}>
                                    <td style={{ paddingTop: '5px' }}>経費計 (Total Expenses)</td>
                                    <td className="amount" style={{ paddingTop: '5px' }}>{formatCurrency(plData.expenses.total)}</td>
                                </tr>

                                <tr className="summary-row final" style={{ background: '#c6f6d5', fontSize: '1.1em', borderTop: '2px solid #38a169' }}>
                                    <td style={{ padding: '15px' }}><strong>Operating Income (所得金額)</strong></td>
                                    <td className="amount" style={{ padding: '15px' }}><strong>{formatCurrency(plData.operating_income)}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Balance Sheet */}
                <div className="report-card" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', overflow: 'hidden', height: 'fit-content' }}>
                    <div style={{ background: '#f7fafc', padding: '15px', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        貸借対照表 (Balance Sheet)
                    </div>
                    <div style={{ padding: '20px' }}>
                        <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#ebf8ff', padding: '8px', color: '#2b6cb0' }}>Assets (資産の部)</th></tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Cash (現金)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.cash || 0)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Deposits (普通預金)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.deposits || 0)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Receivables (売掛金)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.receivables)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Inventory (棚卸資産)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.inventory)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Fixed Assets (固定資産)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.fixed_assets)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Owner's Drawings (事業主貸)</td>
                                    <td className="amount">{formatCurrency(bsData.assets.drawings || 0)}</td>
                                </tr>
                                <tr style={{ borderTop: '2px solid #2b6cb0', fontWeight: 'bold', background: '#f8fbff' }}>
                                    <td style={{ paddingTop: '8px', paddingBottom: '8px' }}>Total Assets (資産合計)</td>
                                    <td className="amount" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                                        {formatCurrency(bsData.assets.total || (bsData.assets.receivables + bsData.assets.inventory + bsData.assets.fixed_assets))}
                                    </td>
                                </tr>

                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#fff5f5', padding: '8px', color: '#c53030', marginTop: '10px', paddingTop: '15px' }}>Liabilities (負債の部)</th></tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Payables (未払金)</td>
                                    <td className="amount">{formatCurrency(bsData.liabilities.payables)}</td>
                                </tr>
                                <tr>
                                    <td style={{ paddingLeft: '20px' }}>Owner's Borrowings (事業主借)</td>
                                    <td className="amount">{formatCurrency(bsData.liabilities.borrowings || 0)}</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #c53030', fontWeight: 'bold' }}>
                                    <td style={{ paddingLeft: '10px' }}>Total Liabilities (負債合計)</td>
                                    <td className="amount">{formatCurrency(bsData.liabilities.total || bsData.liabilities.payables)}</td>
                                </tr>

                                <tr className="section-header"><th colSpan="2" style={{ textAlign: 'left', background: '#faf5ff', padding: '8px', color: '#6b46c1', paddingTop: '15px' }}>Equity (資本の部)</th></tr>
                                {bsData.equity ? (
                                    <>
                                        <tr>
                                            <td style={{ paddingLeft: '20px' }}>Owner's Capital (元入金)</td>
                                            <td className="amount">{formatCurrency(bsData.equity.capital)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ paddingLeft: '20px' }}>Current Income (本年所得)</td>
                                            <td className="amount">{formatCurrency(bsData.equity.current_income)}</td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid #6b46c1', fontWeight: 'bold' }}>
                                            <td style={{ paddingLeft: '10px' }}>Total Equity (資本合計)</td>
                                            <td className="amount">{formatCurrency(bsData.equity.total)}</td>
                                        </tr>
                                    </>
                                ) : (
                                    <tr style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
                                        <td style={{ padding: '10px' }}>Net Worth (正味財産)</td>
                                        <td className="amount" style={{ padding: '10px' }}>{formatCurrency(bsData.net_assets)}</td>
                                    </tr>
                                )}

                                {bsData.equity && (
                                    <tr style={{ borderTop: '3px double #000', fontWeight: 'bold', fontSize: '1.1rem', background: '#f7fafc' }}>
                                        <td style={{ padding: '15px' }}>Total Liab. & Equity (負債資本合計)</td>
                                        <td className="amount" style={{ padding: '15px' }}>
                                            {formatCurrency((bsData.liabilities.total || 0) + (bsData.equity.total || 0))}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Monthly Summary (Page 2) */}
            {monthlyData && (
                <div style={{ padding: '0 20px', marginTop: '30px' }}>
                    <div className="report-card" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        <div style={{ background: '#f7fafc', padding: '15px', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                            月別売上・仕入 (Monthly Breakdown) - 決算書2ページ目
                        </div>
                        <div style={{ padding: '20px', overflowX: 'auto' }}>
                            <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                                <thead>
                                    <tr className="section-header" style={{ background: '#edf2f7' }}>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>月 (Month)</th>
                                        <th style={{ padding: '10px' }}>Sales (売上)</th>
                                        <th style={{ padding: '10px' }}>House Consumption (家事消費)</th>
                                        <th style={{ padding: '10px' }}>Misc Income (雑収入)</th>
                                        <th style={{ padding: '10px' }}>Purchases (仕入)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthlyData.summary.map(row => (
                                        <tr key={row.month}>
                                            <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{row.month}月</td>
                                            <td className="amount">{formatCurrency(row.sales)}</td>
                                            <td className="amount">{formatCurrency(row.house_consumption)}</td>
                                            <td className="amount">{formatCurrency(row.misc_income)}</td>
                                            <td className="amount">{formatCurrency(row.purchases)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ fontWeight: 'bold', background: '#e6fffa', borderTop: '2px solid #38a169' }}>
                                        <td style={{ textAlign: 'left', padding: '10px' }}>Total (合計)</td>
                                        <td className="amount">{formatCurrency(monthlyData.totals.sales)}</td>
                                        <td className="amount">{formatCurrency(monthlyData.totals.house_consumption)}</td>
                                        <td className="amount">{formatCurrency(monthlyData.totals.misc_income)}</td>
                                        <td className="amount">{formatCurrency(monthlyData.totals.purchases)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .report-table td { padding: 8px 8px; border-bottom: 1px solid #edf2f7; }
                .report-table .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: 500; }
                .section-header th { border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
            `}</style>
        </div>
    );
};

export default FinancialReports;
