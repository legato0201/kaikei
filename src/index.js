import { render, useState } from '@wordpress/element';
import SettingsPanel from './components/SettingsPanel';
import { TabPanel } from '@wordpress/components';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import ProDashboard from './components/ProDashboard';
import InventoryList from './components/InventoryList';
import FixedAssetsList from './components/FixedAssetsList';
import FinancialReports from './components/FinancialReports';
import YearEndWizard from './components/YearEndWizard';

import './index.scss';

// Set Webpack Public Path dynamically for asset loading (Fonts, Images)
if (window.breederAccountingSettings && window.breederAccountingSettings.pluginUrl) {
    // eslint-disable-next-line
    __webpack_public_path__ = window.breederAccountingSettings.pluginUrl + 'build/';
}

const App = () => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const triggerRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const [drillDownState, setDrillDownState] = useState({
        key: 0,
        tab: 'dashboard',
        filters: null
    });

    const handleDrillDown = (filters) => {
        setDrillDownState({
            key: drillDownState.key + 1,
            tab: 'list',
            filters: filters
        });
    };

    const settings = window.breederAccountingSettings || {};
    const lockedYear = parseInt(settings.lockedYear) || 0;

    return (
        <div className="breeder-accounting-app wrap">
            <h1 className="wp-heading-inline" style={{ marginBottom: '20px' }}>Breeder ERP <span style={{ fontSize: '12px', background: '#2271b1', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>PRO</span></h1>

            <TabPanel
                key={drillDownState.key}
                className="breeder-tab-panel"
                activeClass="is-active"
                initialTabName={drillDownState.tab}
                onSelect={(tabName) => {
                    // Normal Navigation
                }}
                tabs={[
                    { name: 'dashboard', title: 'Executive Dashboard', className: 'tab-dashboard' },
                    { name: 'form', title: 'New Entry', className: 'tab-form' },
                    { name: 'list', title: 'Ledger (仕訳帳)', className: 'tab-list' },
                    { name: 'inventory', title: 'Inventory (資産・棚卸)', className: 'tab-inventory' },
                    { name: 'assets', title: 'Fixed Assets (固定資産)', className: 'tab-assets' },
                    { name: 'reports', title: 'Reports (決算書)', className: 'tab-reports' },
                    { name: 'closing', title: 'Closing (決算)', className: 'tab-closing' },
                    { name: 'settings', title: 'Settings (設定)', className: 'tab-settings' },
                ]}
            >
                {(tab) => {
                    if (tab.name === 'form') {
                        return <TransactionForm onSuccess={triggerRefresh} lockedYear={lockedYear} />;
                    } else if (tab.name === 'list') {
                        return <TransactionList refreshTrigger={refreshTrigger} externalFilter={drillDownState.filters} lockedYear={lockedYear} />;
                    } else if (tab.name === 'dashboard') {
                        return <ProDashboard refreshTrigger={refreshTrigger} />;
                    } else if (tab.name === 'inventory') {
                        return <InventoryList />;
                    } else if (tab.name === 'assets') {
                        return <FixedAssetsList />;
                    } else if (tab.name === 'reports') {
                        return <FinancialReports onDrillDown={handleDrillDown} />;
                    } else if (tab.name === 'settings') {
                        return <SettingsPanel />;
                    } else if (tab.name === 'closing') {
                        return <YearEndWizard />;
                    }
                    return null;
                }}
            </TabPanel>
        </div>
    );
};

const rootElement = document.getElementById('breeder-accounting-app');
if (rootElement) {
    render(<App />, rootElement);
}
