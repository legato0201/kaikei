<?php
/**
 * Reports REST Controller
 * Generates P/L and B/S data
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Reports
{

    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes()
    {
        register_rest_route('breeder/v1', '/reports/pl', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_pl_data'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));

        register_rest_route('breeder/v1', '/reports/bs', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_bs_data'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));

        register_rest_route('breeder/v1', '/reports/monthly', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_monthly_summary'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));
    }

    public function permissions_check()
    {
        return current_user_can('manage_options');
    }

    /**
     * Get Profit & Loss (P/L) Data
     * Year default: Current Year
     */
    public function get_pl_data($request)
    {
        global $wpdb;
        $year = $request->get_param('year') ?: date('Y');

        // Tables
        $t_trans = $wpdb->prefix . 'breeder_transactions';
        $t_assets = $wpdb->prefix . 'breeder_fixed_assets';
        $t_snaps = $wpdb->prefix . 'breeder_inventory_snapshots';

        // 1. Revenue (売上高, 雑収入)
        $revenue_sql = "SELECT category, SUM(amount_gross) as total FROM $t_trans 
                        WHERE type='income' AND YEAR(date) = %d 
                        GROUP BY category";
        $revenue_rows = $wpdb->get_results($wpdb->prepare($revenue_sql, $year), ARRAY_A);

        $total_revenue = 0;
        $revenue_details = [];
        foreach ($revenue_rows as $row) {
            $total_revenue += $row['total'];
            $revenue_details[$row['category']] = (int) $row['total'];
        }

        // 2. Cost of Goods Sold (COGS / 売上原価)
        // Formula: Opening Inventory + Purchases - Closing Inventory

        // Opening Inventory (Snapshot of Year-1)
        $opening_row = $wpdb->get_row($wpdb->prepare("SELECT total_valuation FROM $t_snaps WHERE year = %d", $year - 1));
        $opening_inventory = $opening_row ? (int) $opening_row->total_valuation : 0;

        // Purchases (仕入高)
        $purchases_sql = "SELECT SUM(amount_gross) FROM $t_trans WHERE type='expense' AND category='仕入高' AND YEAR(date) = %d";
        $purchases = (int) $wpdb->get_var($wpdb->prepare($purchases_sql, $year));

        // Closing Inventory (Snapshot of Year OR Current Active Calculation if not snapshot yet?)
        // If snapshot exists for this year, use it. If not, use 0 or estimate? 
        // For tax purposes, until snapshot is made, profit is provisional. We will try to fetch snapshot.
        $closing_row = $wpdb->get_row($wpdb->prepare("SELECT total_valuation FROM $t_snaps WHERE year = %d", $year));
        $closing_inventory = $closing_row ? (int) $closing_row->total_valuation : 0;

        // If no snapshot for current year (e.g. running mid-year), closing inventory is technically unknown or 0.
        // But for display, maybe we fetch current active inventory valuation?
        if (!$closing_row && $year == date('Y')) {
            // Calculate live
            $t_inv = $wpdb->prefix . 'breeder_inventory';
            $live_val = $wpdb->get_var("SELECT SUM(quantity * cost_price) FROM $t_inv WHERE status='ACTIVE'");
            $closing_inventory = (int) $live_val;
        }

        $cogs = $opening_inventory + $purchases - $closing_inventory;

        // Gross Profit (売上総利益)
        $gross_profit = $total_revenue - $cogs;


        // 3. Expenses (経費)
        $expense_sql = "SELECT category, SUM(amount_gross) as total FROM $t_trans 
                        WHERE type='expense' AND category != '仕入高' AND YEAR(date) = %d 
                        GROUP BY category";
        $expense_rows = $wpdb->get_results($wpdb->prepare($expense_sql, $year), ARRAY_A);

        $total_expenses = 0;
        $expense_details = [];
        foreach ($expense_rows as $row) {
            $total_expenses += $row['total'];
            $expense_details[$row['category']] = (int) $row['total'];
        }

        // 4. Depreciation Expenses (減価償却費)
        // Calculate dynamic depreciation for this year
        $depreciation_total = 0;
        $assets = $wpdb->get_results("SELECT * FROM $t_assets WHERE status != 'RETIRED' OR YEAR(updated_at) = $year", ARRAY_A);

        foreach ($assets as $asset) {
            // Check if active during this year
            $start_date = !empty($asset['service_date']) ? $asset['service_date'] : $asset['purchase_date'];
            $start_year = date('Y', strtotime($start_date));

            if ($start_year > $year)
                continue; // Service started in future

            $cost = (int) $asset['purchase_price'];
            $ratio = isset($asset['business_ratio']) ? (float) $asset['business_ratio'] / 100 : 1.0;

            // If One-Time and bought this year
            if ($asset['method'] === 'ONE_TIME') {
                if ($start_year == $year) {
                    $depreciation_total += floor($cost * $ratio);
                }
            } else {
                // Straight Line with Proration
                $life = (int) $asset['lifespan_years'];
                $full_yearly_dep = floor($cost / $life);

                // Use Service Date for Proration Start
                $start_month = (int) date('n', strtotime($start_date));
                // $start_year is already defined above

                // Calculate accumulated depreciation prior to this year
                $accumulated_full = 0;
                for ($y = $start_year; $y < $year; $y++) {
                    $months = 12;
                    if ($y == $start_year) {
                        $months = 12 - $start_month + 1;
                    }
                    $y_dep = floor($full_yearly_dep * $months / 12);

                    // Cap accumulated at Cost - 1
                    if ($accumulated_full + $y_dep > $cost - 1) {
                        $y_dep = max(0, ($cost - 1) - $accumulated_full);
                    }
                    $accumulated_full += $y_dep;
                }

                // Calculate THIS year's full depreciation
                if ($accumulated_full >= $cost - 1) {
                    $this_year_dep_full = 0;
                } else {
                    $months = 12;
                    if ($year == $start_year) {
                        $months = 12 - $start_month + 1;
                    }
                    $this_year_dep_full = floor($full_yearly_dep * $months / 12);

                    // Cap
                    if ($accumulated_full + $this_year_dep_full > $cost - 1) {
                        $this_year_dep_full = max(0, ($cost - 1) - $accumulated_full);
                    }
                }

                // Apply Ratio to this year's expense
                $depreciation_total += floor($this_year_dep_full * $ratio);
            }
        }

        // Add Depreciation to Expenses
        $total_expenses += $depreciation_total;
        $expense_details['減価償却費'] = $depreciation_total;

        // Operating Income (営業利益)
        $operating_income = $gross_profit - $total_expenses;

        return rest_ensure_response(array(
            'year' => $year,
            'revenue' => array(
                'total' => $total_revenue,
                'details' => $revenue_details
            ),
            'cogs' => array(
                'total' => $cogs,
                'opening_inventory' => $opening_inventory,
                'purchases' => $purchases,
                'closing_inventory' => $closing_inventory
            ),
            'gross_profit' => $gross_profit,
            'expenses' => array(
                'total' => $total_expenses,
                'details' => $expense_details
            ),
            'operating_income' => $operating_income
        ));
    }

    /**
     * Get Balance Sheet (B/S) Data
     * Snapshot at End of Year
     */
    public function get_bs_data($request)
    {
        global $wpdb;
        $year = $request->get_param('year') ?: date('Y');
        $t_trans = $wpdb->prefix . 'breeder_transactions';
        $t_assets = $wpdb->prefix . 'breeder_fixed_assets';
        $t_snaps = $wpdb->prefix . 'breeder_inventory_snapshots';

        // Helper to check date
        $date_limit = "$year-12-31";

        // Fetch Opening Balances (Global)
        $settings = get_option('breeder_accounting_settings', []);
        $opening = isset($settings['opening_balances']) ? $settings['opening_balances'] : [];

        // Helper to safe int
        $get_opening = function ($key) use ($opening) {
            return isset($opening[$key]) ? (int) $opening[$key] : 0;
        };

        // --- ASSETS ---

        // 1. Cash (現金)
        $cash_in = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='income' AND payment_source='cash' AND date <= '$date_limit'");
        $cash_out = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='expense' AND payment_source='cash' AND date <= '$date_limit'");
        $raw_cash_balance = ((int) $cash_in - (int) $cash_out) + $get_opening('cash');

        // Logic Fix: Cash cannot be negative. If negative, it means Owner paid it (Borrowings).
        $cash_balance = ($raw_cash_balance < 0) ? 0 : $raw_cash_balance;
        $cash_deficit = ($raw_cash_balance < 0) ? abs($raw_cash_balance) : 0;

        // 2. Deposits (普通預金)
        // Correct Logic: Only Count SETTLED transactions.
        $bank_sources = "'stripe', 'yahoo', 'bank'";

        // Income into Bank (Net) - only settled
        $bank_in_gross = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='income' AND payment_source IN ($bank_sources) AND date <= '$date_limit' AND status = 'settled'");
        $bank_in_fees = $wpdb->get_var("SELECT SUM(fee) FROM $t_trans WHERE type='income' AND payment_source IN ($bank_sources) AND date <= '$date_limit' AND status = 'settled'");
        $bank_in_shipping = $wpdb->get_var("SELECT SUM(shipping_fee) FROM $t_trans WHERE type='income' AND payment_source IN ($bank_sources) AND date <= '$date_limit' AND status = 'settled'");

        $bank_in_net = (int) $bank_in_gross - (int) $bank_in_fees - (int) $bank_in_shipping;

        // Expense from Bank
        $bank_out = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='expense' AND payment_source='bank' AND date <= '$date_limit'");

        $deposits_balance = ($bank_in_net - (int) $bank_out) + $get_opening('deposits');

        // 3. Receivables (売掛金)
        // Unsettled Income, or settled AFTER year end
        // Fix: Subtract Fee and Shipping from Receivables (Net Receivable)
        $receivables_calc = $wpdb->get_var("SELECT SUM(amount_gross) - SUM(fee) - SUM(shipping_fee) FROM $t_trans WHERE type='income' AND date <= '$date_limit' AND (status='unsettled' OR deposit_date > '$date_limit')");
        $receivables = (int) $receivables_calc + $get_opening('receivables');

        // 4. Inventory (棚卸資産)
        $inv_row = $wpdb->get_row($wpdb->prepare("SELECT total_valuation FROM $t_snaps WHERE year = %d", $year));
        $inventory_val = $inv_row ? (int) $inv_row->total_valuation : 0;
        if (!$inv_row && $year == date('Y')) {
            $t_inv = $wpdb->prefix . 'breeder_inventory';
            $inventory_val = (int) $wpdb->get_var("SELECT SUM(quantity * cost_price) FROM $t_inv WHERE status='ACTIVE'");
        }
        // Note: Inventory Opening Balance (期首棚卸高) affects P/L, not B/S directly (B/S is Ending Inventory).
        // Opening Balances usually refers to "Assets carried over". 
        // If we set an opening balance for inventory, it essentially becomes Opening Stock for Year 1.
        // B/S shows "Closing Inventory". Opening Balance doesn't explicitly add to Closing Inventory unless we track it that way.
        // We will ignore Opening Balance for Inventory on B/S, because B/S Inventory must match Current Stock Valuation.

        // 5. Fixed Assets (固定資産)
        $fixed_assets_val = 0;
        $assets = $wpdb->get_results("SELECT * FROM $t_assets WHERE purchase_date <= '$date_limit'", ARRAY_A);
        foreach ($assets as $asset) {
            $purchase_year = date('Y', strtotime($asset['purchase_date']));
            $cost = (int) $asset['purchase_price'];

            if ($asset['method'] === 'ONE_TIME') {
                $fixed_assets_val += 1; // Memo value
            } else {
                // Straight Line logic
                // Calculate accumulated depreciation UP TO date_limit (Year End)
                $life = (int) $asset['lifespan_years'];
                $full_yearly_dep = floor($cost / $life);
                $purchase_month = (int) date('n', strtotime($asset['purchase_date']));

                $accumulated_full = 0;
                // Loop through years from purchase_year up to CURRENT year ($year)
                for ($y = $purchase_year; $y <= $year; $y++) {
                    $months = 12;
                    if ($y == $purchase_year) {
                        $months = 12 - $purchase_month + 1;
                    }

                    $y_dep = floor($full_yearly_dep * $months / 12);

                    // Cap accumulated at Cost - 1
                    if ($accumulated_full + $y_dep > $cost - 1) {
                        $y_dep = max(0, ($cost - 1) - $accumulated_full);
                    }
                    $accumulated_full += $y_dep;

                    if ($accumulated_full >= $cost - 1)
                        break;
                }

                $book_val = max(1, $cost - $accumulated_full);
                $fixed_assets_val += $book_val;
            }
        }

        // 6. Owner's Drawings (事業主貸)
        $drawings = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='expense' AND category='事業主貸' AND date <= '$date_limit'");

        // --- LIABILITIES ---

        // 1. Payables (未払金)
        $payables_calc = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans 
            WHERE type='expense' 
            AND payment_source != 'private_card'
            AND date <= '$date_limit' 
            AND (status='unsettled' OR deposit_date > '$date_limit')");
        $payables = (int) $payables_calc + $get_opening('payables');

        // 2. Owner's Borrowings (事業主借) - Base (Recorded)
        $borrowings_recorded = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='expense' AND payment_source='private_card' AND date <= '$date_limit'");
        $borrowings_injection = $wpdb->get_var("SELECT SUM(amount_gross) FROM $t_trans WHERE type='income' AND category='事業主借' AND date <= '$date_limit'");

        $borrowings_base = ((int) $borrowings_recorded + (int) $borrowings_injection + (int) $cash_deficit) + $get_opening('borrowings');


        // --- EQUITY ---

        // 1. Current Income (本年所得)
        $pl_response = $this->get_pl_data($request);
        $pl_data = $pl_response->get_data();
        $current_income = $pl_data['operating_income'];

        // 2. Owner's Capital (元入金)
        // Fixed + Opening
        $owner_capital = $get_opening('capital');

        // 3. Balance Plug -> Owner's Borrowings (事業主借)
        $total_assets_val = (int) $cash_balance + (int) $deposits_balance + (int) $receivables + (int) $inventory_val + (int) $fixed_assets_val + (int) $drawings;

        $liabs_equity_known = (int) $payables + (int) $borrowings_base + (int) $owner_capital + (int) $current_income;

        $plug = $total_assets_val - $liabs_equity_known;
        $final_borrowings = $borrowings_base + $plug;

        // Final Totals
        $total_liab = (int) $payables + $final_borrowings;
        $total_equity = $owner_capital + $current_income;

        return rest_ensure_response(array(
            'year' => $year,
            'assets' => array(
                'cash' => (int) $cash_balance,
                'deposits' => (int) $deposits_balance,
                'receivables' => (int) $receivables,
                'inventory' => (int) $inventory_val,
                'fixed_assets' => (int) $fixed_assets_val,
                'drawings' => (int) $drawings,
                'total' => $total_assets_val
            ),
            'liabilities' => array(
                'payables' => (int) $payables,
                'borrowings' => (int) $final_borrowings,
                'total' => $total_liab
            ),
            'equity' => array(
                'capital' => $owner_capital,
                'current_income' => $current_income,
                'total' => $total_equity
            ),
            'net_assets' => $total_assets_val - $total_liab
        ));
    }

    /**
     * Get Monthly Summary (Blue Return Page 2)
     */
    public function get_monthly_summary($request)
    {
        global $wpdb;
        $year = $request->get_param('year') ?: date('Y');
        $t_trans = $wpdb->prefix . 'breeder_transactions';

        // Initialize 12 months (Jan-Dec)
        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $months[$m] = [
                'sales' => 0,
                'house_consumption' => 0,
                'misc_income' => 0,
                'purchases' => 0
            ];
        }

        // 1. Sales (売上)
        $sales_rows = $wpdb->get_results($wpdb->prepare("
            SELECT MONTH(date) as month, SUM(amount_gross) as total 
            FROM $t_trans 
            WHERE type='income' AND category='売上高' AND YEAR(date) = %d AND deleted_at IS NULL
            GROUP BY MONTH(date)
        ", $year));

        foreach ($sales_rows as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['sales'] = (int) $row->total;
            }
        }

        // 1b. House Consumption (家事消費)
        $house_rows = $wpdb->get_results($wpdb->prepare("
            SELECT MONTH(date) as month, SUM(amount_gross) as total 
            FROM $t_trans 
            WHERE type='income' AND category='家事消費' AND YEAR(date) = %d AND deleted_at IS NULL
            GROUP BY MONTH(date)
        ", $year));

        foreach ($house_rows as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['house_consumption'] = (int) $row->total;
            }
        }

        // 2. Misc Income (雑収入)
        $misc_rows = $wpdb->get_results($wpdb->prepare("
            SELECT MONTH(date) as month, SUM(amount_gross) as total 
            FROM $t_trans 
            WHERE type='income' AND category='雑収入' AND YEAR(date) = %d AND deleted_at IS NULL
            GROUP BY MONTH(date)
        ", $year));

        foreach ($misc_rows as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['misc_income'] = (int) $row->total;
            }
        }

        // 3. Purchases (仕入)
        $purchase_rows = $wpdb->get_results($wpdb->prepare("
            SELECT MONTH(date) as month, SUM(amount_gross) as total 
            FROM $t_trans 
            WHERE type='expense' AND category='仕入高' AND YEAR(date) = %d AND deleted_at IS NULL
            GROUP BY MONTH(date)
        ", $year));

        foreach ($purchase_rows as $row) {
            if (isset($months[$row->month])) {
                $months[$row->month]['purchases'] = (int) $row->total;
            }
        }

        // Format for Chart/Table: array of month objects
        return rest_ensure_response([
            'year' => $year,
            'summary' => array_values(array_map(function ($m, $data) {
                return ['month' => $m, ...$data];
            }, array_keys($months), $months)),
            'totals' => [
                'sales' => array_sum(array_column($months, 'sales')),
                'house_consumption' => array_sum(array_column($months, 'house_consumption')),
                'misc_income' => array_sum(array_column($months, 'misc_income')),
                'purchases' => array_sum(array_column($months, 'purchases'))
            ]
        ]);
    }

}
