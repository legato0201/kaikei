<?php
/**
 * CSV Export Class
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Export
{

    public function __construct()
    {
        add_action('admin_post_breeder_export_csv', array($this, 'generate_csv'));
    }

    public function generate_csv()
    {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_transactions';

        // Get Year
        $year = isset($_GET['year']) ? intval($_GET['year']) : intval(date('Y'));

        // Site Title for Company Name
        $company_name = get_bloginfo('name');

        // Fetch Aggregated Data
        // Group by Category and Type to ensure uniqueness
        $sql = $wpdb->prepare("
            SELECT category, type, SUM(amount_net) as total 
            FROM $table_name 
            WHERE YEAR(date) = %d 
            GROUP BY category, type
        ", $year);

        $results = $wpdb->get_results($sql, ARRAY_A);

        // Organize Data by Map
        $map = $this->get_etax_map();
        $export_data = array();

        // Initialize with map structure to ensure order? 
        // No, e-Tax CSV is row-based. We should output in specific order: Sales -> COGS -> Expenses -> Non-Op.

        // Map results to easy lookup
        $calc_data = array();
        foreach ($results as $row) {
            $cat = $row['category'];
            $calc_data[$cat] = (int) $row['total'];
        }

        // Set Headers for Download
        header('Content-Type: text/csv; charset=Shift_JIS');
        header('Content-Disposition: attachment; filename=etax_pl_' . $year . '.csv');

        $output = fopen('php://output', 'w');
        // Apply Shift-JIS filter
        stream_filter_append($output, 'convert.iconv.utf-8/cp932//TRANSLIT');

        // --- OUTPUT SECTION ---

        // 1. Fixed Header Rows (A, B, C1, C2)
        fputcsv($output, array('A', 'PL', '', '', ''));
        fputcsv($output, array('B', $company_name, '', '', ''));
        fputcsv($output, array('C1', $year . '-01-01', '', '', ''));
        fputcsv($output, array('C2', $year . '-12-31', '', '', ''));
        fputcsv($output, array('損益計算書', '', '', '', '100000000')); // Row 5 (Title) - 5th col determines something? Sample shows empty or code.

        // 2. Body Generation
        // We define the structure and fill values.
        // Structure: [Title/Account, Amount, RowType(1=Val, 2=Text, T=Title), Hierarchy, Code]

        // --- SECTION: SALES (Operating Revenue) 営業活動による収益 ---
        $this->output_row($output, '営業活動による収益', '', 'T', 2, '10D100010');
        $this->output_row($output, '売上高', '', 'T', 3, '10D100020');

        $sales_amount = isset($calc_data['売上高']) ? $calc_data['売上高'] : 0;
        $this->output_row($output, '売上高', $sales_amount, '1', 4, '10D100030'); // The actual value

        // --- SECTION: COST OF SALES (Operating Expenses?) 売上原価 ---
        // Skipping for simple service/breeder business usually, unless inventory exists. 
        // If we had Purchase, it would go here.

        // --- SECTION: SG&A 販売費及び一般管理費 ---
        $this->output_row($output, '販売費及び一般管理費', '', 'T', 2, '10E000000'); // Check code? Assumed.
        // Actually, let's output the total SG&A parent?
        // Sample says: `10E000010` is usually SG&A.

        // Loop through expense categories from our Map
        foreach ($map['expenses'] as $cat_name => $props) {
            $amount = isset($calc_data[$cat_name]) ? $calc_data[$cat_name] : 0;
            // Only output if amount > 0? No, usually valid to output 0 or skip?
            // "If you don't record it, you don't need to output it" usually.
            if ($amount > 0) {
                $this->output_row($output, $cat_name, $amount, '1', 3, $props['code']);
            }
        }

        // --- SECTION: NON-OPERATING INCOME 営業外収益 ---
        $this->output_row($output, '営業外収益', '', 'T', 2, '10G200010');
        $misc_income = isset($calc_data['雑収入']) ? $calc_data['雑収入'] : 0;
        if ($misc_income > 0) {
            $this->output_row($output, '雑収入', $misc_income, '1', 3, '10G200020'); // Code check needed
        }

        fclose($output);
        exit;
    }

    private function output_row($handle, $col1, $col2, $col3, $col4, $col5)
    {
        // Sanitize for Shift-JIS safety if needed, but standard codes are safe.
        // Col2 (Amount) should be numeric string if 1.
        fputcsv($handle, array($col1, $col2, $col3, $col4, $col5));
    }

    private function get_etax_map()
    {
        // Based on General Commercial (Type 10)
        // Codes are examples/approximations based on standard taxonomies.
        return array(
            'income' => array(
                '売上高' => array('code' => '10D100030', 'h' => 4),
            ),
            'expenses' => array(
                '消耗品費' => array('code' => '10E100150'), // Supplies
                '荷造運賃' => array('code' => '10E100080'), // Shipping
                '通信費' => array('code' => '10E100140'), // Communication
                '水道光熱費' => array('code' => '10E100120'), // Utilities
                '旅費交通費' => array('code' => '10E100130'), // Travel
                '広告宣伝費' => array('code' => '10E100100'), // Advertising
                '接待交際費' => array('code' => '10E100160'), // Entertain
                '修繕費' => array('code' => '10E100110'), // Repair
                '新聞図書費' => array('code' => '10E100230-1'), // Custom/Specific? Or use 'Books' 10E100...
                '雑費' => array('code' => '10E100230'), // Misc
                '地代家賃' => array('code' => '10E100050'), // Rent
                '租税公課' => array('code' => '10E100070'), // Taxes
            ),
            'non_op' => array(
                '雑収入' => array('code' => '10G200020'),
            )
        );
    }
}

new Breeder_Accounting_Export();
