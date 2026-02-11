<?php
/**
 * e-Tax CSV Exporter
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_ETax
{
    private $namespace = 'breeder/v1';

    public function register_routes()
    {
        register_rest_route($this->namespace, '/etax/export', array(
            'methods' => 'GET',
            'callback' => array($this, 'export_csv'),
            'permission_callback' => array($this, 'permissions_check'),
            'args' => array(
                'year' => array(
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ),
                'type' => array( // 'PL' (Income Statement) or 'BS' (Balance Sheet)
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return in_array($param, array('PL', 'BS', 'MONTHLY'));
                    }
                )
            )
        ));
    }

    public function permissions_check()
    {
        return current_user_can('manage_options');
    }

    /**
     * Export CSV
     */
    public function export_csv($request)
    {
        global $wpdb;
        $year = intval($request->get_param('year'));
        $type = $request->get_param('type');

        // Headers for Download
        $filename = "HOI010_4.0_{$type}_{$year}.csv";

        // Fetch Data Wrapper
        if ($type === 'PL') {
            $data = $this->get_pl_data($year);
        } elseif ($type === 'BS') {
            $data = $this->get_bs_data($year);
        } else {
            $data = $this->get_monthly_data($year);
        }

        // Generate CSV Content (Shift-JIS)
        // e-Tax Standard Form: "AccountName,Amount,Details..."
        $csv_lines = [];

        // Header Row? Usually e-Tax import skips header if configured, 
        // but spec says "Account Name, Amount". 
        // User request says: "Usually remove header or start from specific line".
        // We will omit header row to be safe or include it if useful for user review.
        // Let's include header but tell user to ignore it if needed? NO, standard is usually raw data.
        // Let's output raw data.

        foreach ($data as $row) {
            $line = array(
                $this->sanitize_csv_field($row['account']),
                $row['amount'], // No commas
                isset($row['detail']) ? $this->sanitize_csv_field($row['detail']) : ''
            );

            // CSV Escape? standard putcsv handles it.
            // But we need Shift-JIS.
            $csv_lines[] = $line;
        }

        // Buffer Output
        // We need to return text/csv with correct encoding.
        // WP REST API returns JSON by default. We must bypass or echo.
        // But for "Download", usually we return a URL to a file or stream.
        // Serving directly from REST is tricky with WP.
        // Easier: Generate string, return Base64 JSON? Or echo and exit.

        // Method: Echo and Exit (Standard WP CSV Export pattern)
        header('Content-Type: text/csv; charset=Shift_JIS');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $fp = fopen('php://output', 'w');

        // BOM? No BOM for Shift-JIS.

        foreach ($csv_lines as $fields) {
            // Convert to SJIS before fputcsv? 
            // fputcsv writes utf8.
            // Better to convert fields first.
            $fields_sjis = array_map(function ($f) {
                return mb_convert_encoding($f, 'SJIS-win', 'UTF-8');
            }, $fields);

            fputcsv($fp, $fields_sjis);
        }

        fclose($fp);
        exit;
    }

    /**
     * Get P/L Data (Income Statement)
     */
    private function get_pl_data($year)
    {
        // Reuse Logic from Reports Class or Duplicate?
        // Let's duplicate specifically for P/L Aggregation to e-Tax Format.
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_transactions';

        // 1. Revenue
        $revenue_accounts = array(
            '売上高' => 0,
            '家事消費' => 0,
            '雑収入' => 0
        );

        // Sales
        $sql_sales = $wpdb->prepare("
            SELECT SUM(amount_gross) FROM $table_name 
            WHERE type = 'income' AND category = '売上' AND YEAR(date) = %d AND deleted_at IS NULL
        ", $year);
        $revenue_accounts['売上高'] = (int) $wpdb->get_var($sql_sales);

        // Misc Income
        $sql_misc = $wpdb->prepare("
            SELECT SUM(amount_gross) FROM $table_name 
            WHERE type = 'income' AND category = '雑収入' AND YEAR(date) = %d AND deleted_at IS NULL
        ", $year);
        $revenue_accounts['雑収入'] = (int) $wpdb->get_var($sql_misc);

        // 2. Cost of Sales (COGS)
        // Opening Inventory + Purchases - Closing Inventory
        // e-Tax usually wants just the final "Cost of Sales" or breakdown?
        // "期首商品棚卸高", "仕入金額", "期末商品棚卸高".

        $cogs_accounts = array(
            '期首商品棚卸高' => 0, // TODO: Fetch from Settings or Previous Year
            '仕入金額' => 0,
            '期末商品棚卸高' => 0  // TODO: Fetch from Inventory Snapshot
        );

        $sql_purchase = $wpdb->prepare("
            SELECT SUM(amount_gross) FROM $table_name 
            WHERE type = 'expense' AND category = '仕入高' AND YEAR(date) = %d AND deleted_at IS NULL
        ", $year);
        $cogs_accounts['仕入金額'] = (int) $wpdb->get_var($sql_purchase);

        // Fetch Inventory Snapshot for Closing
        $snap_table = $wpdb->prefix . 'breeder_inventory_snapshots';
        $closing = $wpdb->get_var($wpdb->prepare("SELECT total_valuation FROM $snap_table WHERE year = %d", $year));
        $cogs_accounts['期末商品棚卸高'] = (int) $closing;

        // Opening (Last Year Closing)
        $opening = $wpdb->get_var($wpdb->prepare("SELECT total_valuation FROM $snap_table WHERE year = %d", $year - 1));
        $cogs_accounts['期首商品棚卸高'] = (int) $opening;

        // 3. Expenses
        // Standard e-Tax Expense Categories
        $target_expenses = array(
            '租税公課',
            '荷造運賃',
            '水道光熱費',
            '旅費交通費',
            '通信費',
            '広告宣伝費',
            '接待交際費',
            '損害保険料',
            '修繕費',
            '消耗品費',
            '減価償却費',
            '福利厚生費',
            '給料賃金',
            '外注工賃',
            '利子割引料',
            '地代家賃',
            '貸倒金',
            '雑費'
        );

        $expense_rows = [];

        foreach ($target_expenses as $cat) {
            // "Commision Fee" (支払手数料) is mapped to '雑費' or specific line?
            // User spec E18 is 雑費. 
            // e-Tax usually has '支払手数料' as a separate item if Blue Return?
            // Actually '支払手数料' is often '雑費' or added line manually.
            // Let's check standard Blue Return Form. It DOES NOT have '支払手数料' printed line. 
            // It has blank lines.
            // Strategy: Map knowns, put others in '雑費' or distinct Blank lines?
            // CSV allows adding rows.

            $amount = 0;
            if ($cat === '減価償却費') {
                // Fetch from Assets Controller Calculation? OR Transactions if we booked them?
                // We booked them in JEs.
                // So we can query transactions category = '減価償却費'
                $amount = (int) $wpdb->get_var($wpdb->prepare("
                    SELECT SUM(amount_gross) FROM $table_name 
                    WHERE type = 'expense' AND category = %s AND YEAR(date) = %d AND deleted_at IS NULL
                 ", $cat, $year));
            } elseif ($cat === '雑費') {
                // Include '支払手数料' here? Or separate?
                // Let's separate '支払手数料' as its own row (e-Tax allows free text rows)
                $amount = (int) $wpdb->get_var($wpdb->prepare("
                    SELECT SUM(amount_gross) FROM $table_name 
                    WHERE type = 'expense' AND category = '雑費' AND YEAR(date) = %d AND deleted_at IS NULL
                 ", $year));
            } else {
                $amount = (int) $wpdb->get_var($wpdb->prepare("
                    SELECT SUM(amount_gross) FROM $table_name 
                    WHERE type = 'expense' AND category = %s AND YEAR(date) = %d AND deleted_at IS NULL
                 ", $cat, $year));
            }

            if ($amount > 0) {
                $expense_rows[$cat] = $amount;
            }
        }

        // Handle "Fees" (Commission) separated
        $fees = (int) $wpdb->get_var($wpdb->prepare("
            SELECT SUM(amount_gross) FROM $table_name 
            WHERE type = 'expense' AND category = '支払手数料' AND YEAR(date) = %d AND deleted_at IS NULL
        ", $year));

        // Add Fee from Income side! (Strict Gross Principle)
        $income_fees = (int) $wpdb->get_var($wpdb->prepare("
            SELECT SUM(fee) FROM $table_name 
            WHERE type = 'income' AND YEAR(date) = %d AND deleted_at IS NULL
        ", $year));

        $total_fees = $fees + $income_fees;

        if ($total_fees > 0) {
            $expense_rows['支払手数料'] = $total_fees;
        }

        // Format for CSV
        $output = [];

        // Revenue Section
        foreach ($revenue_accounts as $k => $v) {
            if ($v !== 0 || $k === '売上高') { // Always show Sales
                $output[] = array('account' => $k, 'amount' => $v);
            }
        }

        // COGS Section
        foreach ($cogs_accounts as $k => $v) {
            $output[] = array('account' => $k, 'amount' => $v);
        }

        // Expenses Section
        foreach ($expense_rows as $k => $v) {
            $output[] = array('account' => $k, 'amount' => $v);
        }

        return $output;
    }

    /**
     * Get BS Data (Balance Sheet)
     */
    /**
     * Get BS Data (Balance Sheet)
     */
    private function get_bs_data($year)
    {
        // Reuse Logic from Reports Class
        if (!class_exists('Breeder_Accounting_Reports')) {
            require_once dirname(__FILE__) . '/class-breeder-accounting-reports.php';
        }

        $reports = new Breeder_Accounting_Reports();
        $request = new WP_REST_Request('GET', '/breeder/v1/reports/bs');
        $request->set_param('year', $year);

        $response = $reports->get_bs_data($request);

        if (is_wp_error($response)) {
            return array();
        }

        $data = $response->get_data();

        // Map to e-Tax Format (Account Name, Amount)
        $output = [];

        // Assets
        if (isset($data['assets'])) {
            $output[] = array('account' => '現金', 'amount' => $data['assets']['cash']);
            $output[] = array('account' => '普通預金', 'amount' => $data['assets']['deposits']);
            $output[] = array('account' => '売掛金', 'amount' => $data['assets']['receivables']);
            $output[] = array('account' => '棚卸資産', 'amount' => $data['assets']['inventory']);
            $output[] = array('account' => '工具器具備品', 'amount' => $data['assets']['fixed_assets']);
            $output[] = array('account' => '事業主貸', 'amount' => $data['assets']['drawings']);
        }

        // Liabilities
        if (isset($data['liabilities'])) {
            $output[] = array('account' => '未払金', 'amount' => $data['liabilities']['payables']);
            $output[] = array('account' => '事業主借', 'amount' => $data['liabilities']['borrowings']);
        }

        // Equity
        if (isset($data['equity'])) {
            $output[] = array('account' => '元入金', 'amount' => $data['equity']['capital']);
            $output[] = array('account' => '青色申告特別控除前の所得金額', 'amount' => $data['equity']['current_income']);
        }

        return $output;
    }

    /**
     * Get Monthly Data (Blue Return Page 2)
     */
    private function get_monthly_data($year)
    {
        if (!class_exists('Breeder_Accounting_Reports')) {
            require_once dirname(__FILE__) . '/class-breeder-accounting-reports.php';
        }

        $reports = new Breeder_Accounting_Reports();
        $request = new WP_REST_Request('GET', '/breeder/v1/reports/monthly');
        $request->set_param('year', $year);

        $response = $reports->get_monthly_summary($request);

        if (is_wp_error($response)) {
            return array();
        }

        $data = $response->get_data();
        $summary = isset($data['summary']) ? $data['summary'] : array();

        // Output Format
        $output = [];
        // Header Row for reference (e-Tax mostly data, but monthly is table-like)
        $output[] = array('account' => '月', 'amount' => '売上金額', 'detail' => '家事消費,雑収入,仕入金額');

        foreach ($summary as $row) {
            $line = array(
                'account' => $row['month'] . '月',
                'amount' => $row['sales'],
                'detail' => sprintf(
                    '家事:%d, 雑:%d, 仕入:%d',
                    $row['house_consumption'],
                    $row['misc_income'],
                    $row['purchases']
                )
            );
            $output[] = $line;
        }

        // Add Totals Row
        $totals = $data['totals'];
        $output[] = array(
            'account' => '合計',
            'amount' => $totals['sales'],
            'detail' => sprintf(
                '家事:%d, 雑:%d, 仕入:%d',
                $totals['house_consumption'],
                $totals['misc_income'],
                $totals['purchases']
            )
        );

        return $output;
    }

    private function sanitize_csv_field($str)
    {
        $str = str_replace(array("\r", "\n"), '', $str);
        return trim($str);
    }
}
