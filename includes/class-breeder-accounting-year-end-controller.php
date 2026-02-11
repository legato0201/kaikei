<?php
if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Year_End_Controller extends WP_REST_Controller
{
    public function register_routes()
    {
        $namespace = 'breeder/v1';
        $base = 'year-end';

        register_rest_route($namespace, '/' . $base . '/snapshot', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'create_snapshot'),
            'permission_callback' => array($this, 'permissions_check'),
        ));

        register_rest_route($namespace, '/' . $base . '/apportionment', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'create_apportionment'),
            'permission_callback' => array($this, 'permissions_check'),
        ));

        register_rest_route($namespace, '/' . $base . '/depreciation', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'create_depreciation'),
            'permission_callback' => array($this, 'permissions_check'),
        ));

        register_rest_route($namespace, '/' . $base . '/lock', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'lock_year'),
            'permission_callback' => array($this, 'permissions_check'),
        ));
    }

    public function permissions_check($request)
    {
        return current_user_can('manage_options');
    }

    /**
     * Snapshot: Calculate Inventory & Supplies, create JE
     */
    public function create_snapshot($request)
    {
        global $wpdb;
        $params = $request->get_json_params();
        $year = intval($params['year']);
        $date = sanitize_text_field($params['date']); // e.g. 2026-12-31

        // 0. Cleanup Previous Entries (Idempotency)
        $this->delete_previous_entries($year, '%期末棚卸%');

        // 1. Calculate Totals
        // Product Inventory (PURCHASED + BRED)
        $sql_products = "SELECT SUM(quantity * cost_price) FROM {$wpdb->prefix}breeder_inventory WHERE status = 'ACTIVE' AND source_type IN ('PURCHASED', 'BRED')";
        $total_products = intval($wpdb->get_var($sql_products));

        // Supplies (SUPPLY)
        $sql_supplies = "SELECT SUM(quantity * cost_price) FROM {$wpdb->prefix}breeder_inventory WHERE status = 'ACTIVE' AND source_type = 'SUPPLY'";
        $total_supplies = intval($wpdb->get_var($sql_supplies));

        // 2. Create Snapshot Record
        $wpdb->replace(
            $wpdb->prefix . 'breeder_inventory_snapshots',
            array(
                'year' => $year,
                'snapshot_date' => $date,
                'total_valuation' => $total_products + $total_supplies,
                'data_json' => json_encode(array('products' => $total_products, 'supplies' => $total_supplies))
            ),
            array('%d', '%s', '%d', '%s')
        );

        // 3. Create Journal Entries
        $entries_created = [];

        // A. Merchandise (商品)
        if ($total_products > 0) {
            $id_prod = $this->create_journal_entry(
                $date,
                'expense',
                '期末商品棚卸高',
                '',
                $total_products,
                '商品',
                '期末商品棚卸高', // Debit: 商品, Credit: 期末棚卸
                "{$year}年度 期末棚卸 (商品)",
                0 // source_asset_id
            );
            $entries_created[] = $id_prod;
        }

        // B. Supplies (貯蔵品)
        if ($total_supplies > 0) {
            $id_supp = $this->create_journal_entry(
                $date,
                'expense',
                '消耗品費',
                '',
                $total_supplies,
                '貯蔵品',
                '消耗品費', // Debit: 貯蔵品, Credit: 消耗品費 (Reduce expense)
                "{$year}年度 期末棚卸 (貯蔵品・未使用分)",
                0 // source_asset_id
            );
            $entries_created[] = $id_supp;
        }

        return rest_ensure_response(array('success' => true, 'total_valuation' => $total_products + $total_supplies, 'entries' => $entries_created));
    }

    /**
     * Apportionment: Private Use Adjustment
     * Expects ratios as array of objects: [{ category: '...', sub_category: '...', ratio: 50 }]
     */
    public function create_apportionment($request)
    {
        global $wpdb;
        $params = $request->get_json_params();
        $year = intval($params['year']);
        $date = sanitize_text_field($params['date']);
        $ratios = $params['ratios'];

        // 0. Cleanup Previous Entries (Idempotency)
        $this->delete_previous_entries($year, '%家事按分%');

        $entries_created = [];

        // Normalize legacy input format (dictionary) if necessary, or assume new list format
        // Logic: Iterate provided config, sum relevant expenses, create adjustment.

        foreach ($ratios as $config) {
            $category = sanitize_text_field($config['category']);
            $sub_category = isset($config['sub_category']) ? sanitize_text_field($config['sub_category']) : '';
            $business_ratio = intval($config['ratio']);

            if ($business_ratio >= 100 || $business_ratio <= 0)
                continue;

            $private_ratio = 100 - $business_ratio;

            // Calculate Total Expense for this Category/SubCategory in Year
            $start_date = "{$year}-01-01";
            $end_date = "{$year}-12-31";

            $sql = "SELECT SUM(amount_gross) FROM {$wpdb->prefix}breeder_transactions 
                    WHERE type = 'expense' 
                    AND category = %s 
                    AND date BETWEEN %s AND %s
                    AND description NOT LIKE %s";

            $query_args = [$category, $start_date, $end_date, '%家事按分%'];

            // Filter by Sub-Category if provided, otherwise include all or empty?
            // If sub_category is provided, we specifically target it.
            if (!empty($sub_category)) {
                $sql .= " AND sub_category = %s";
                $query_args[] = $sub_category;
            } else {
                // If sub_category is empty in config, should we only sum entries with empty sub_category?
                // Or sum ALL entries for that category regardless?
                // For "Rent", it likely has no sub-category.
                // For "Utilities", if split into Electric/Water, we must match sub_category.
                // Safer: IF config has empty sub_category, match empty sub_category in DB.
                // Or allow a "Catch All" mode?
                // For now: Strict match. If user config says sub_cat='', we look for sub_cat=''.
                // EXCEPT if user didn't use sub-categories at all in input.
                // Let's assume strict match for now as we are strictly adding this feature.
                $sql .= " AND (sub_category = '' OR sub_category IS NULL)";
            }

            $sql = $wpdb->prepare($sql, $query_args);
            $total_expense = intval($wpdb->get_var($sql));

            if ($total_expense > 0) {
                $private_amount = intval(round($total_expense * ($private_ratio / 100)));

                if ($private_amount > 0) {
                    $desc_sub = !empty($sub_category) ? " ({$sub_category})" : "";
                    $id = $this->create_journal_entry(
                        $date,
                        'expense',
                        $category,
                        $sub_category,
                        $private_amount,
                        '事業主貸',
                        $category, // Debit: Owner Draw, Credit: Expense Category (Reduction)
                        "{$year}年度 家事按分{$desc_sub} (事業割合 {$business_ratio}%)",
                        0 // source_asset_id
                    );
                    $entries_created[] = array('category' => $category, 'sub_category' => $sub_category, 'private_amount' => $private_amount, 'id' => $id);
                }
            }
        }

        return rest_ensure_response(array('success' => true, 'entries' => $entries_created));
    }

    /**
     * Depreciation: Fixed Assets
     */
    public function create_depreciation($request)
    {
        global $wpdb;
        $params = $request->get_json_params();
        $year = intval($params['year']);
        $date = sanitize_text_field($params['date']);

        // 0. Cleanup Previous Entries (Idempotency for Journal)
        $this->delete_previous_entries($year, '%減価償却%');

        // Get Active Assets
        $assets = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}breeder_fixed_assets WHERE status = 'ACTIVE'");

        $total_depreciation = 0;
        $entries = [];

        foreach ($assets as $asset) {
            $price = intval($asset->purchase_price);
            $lifespan = intval($asset->lifespan_years);
            $ratio = intval($asset->business_ratio) / 100;
            $service_date = $asset->service_date ? $asset->service_date : $asset->purchase_date;
            $service_year = intval(substr($service_date, 0, 4));

            if ($lifespan <= 0)
                continue;

            // 1. Calculate Annual Base Depreciation (Straight Line)
            $annual_base = floor($price / $lifespan);

            // 2. Identify Timeframe
            // If asset is in future (e.g. bought in 2027, running 2026), skip.
            if ($service_year > $year)
                continue;

            // 3. Calculate "Theoretical" Accumulated Depreciation up to End of THIS Year
            // We reconstruct the history to ensure Idempotency (Book Value checks).

            $accumulated_dep = 0;
            $this_year_dep_gross = 0;

            // Loop through years from ServiceYear to CurrentYear
            // This loop is usually small (e.g. 1-10 years)
            for ($y = $service_year; $y <= $year; $y++) {
                // Calculate Dep for Year $y
                $y_dep = 0;
                $months = 12;

                if ($y == $service_year) {
                    // First Year Proration
                    $svc_month = intval(substr($service_date, 5, 2));
                    $months = 13 - $svc_month;
                }

                // Check if lifespan expired for this simulated year?
                // Logic: A 4-year asset depreciates for max 48 months-ish volume.
                // Or simplified: Just check years passed.
                // If ($y - $service_year) >= $lifespan + 1 ??
                // Let's use the explicit logic from before, but per year.

                $diff = $y - $service_year;
                if ($diff > $lifespan) {
                    $y_dep = 0;
                } elseif ($diff == $lifespan) {
                    // Only allowed if first year was partial.
                    // If first year was full (months=12), then Year Ind 4 is Year 5 -> Expired.
                    $first_year_months = 13 - intval(substr($service_date, 5, 2));
                    if ($first_year_months == 12) {
                        $y_dep = 0;
                    } else {
                        // Tail end
                        // Math: To balance to exactly 'Price'?
                        // Simplified: Assume full annual until it hits floor later.
                        $y_dep = floor($annual_base * ($months / 12));
                    }
                } else {
                    $y_dep = floor($annual_base * ($months / 12));
                }

                if ($y == $year) {
                    $this_year_dep_gross = $y_dep;
                } else {
                    $accumulated_dep += $y_dep;
                }
            }

            // 4. Calculate Limits (1 JPY Floor)
            // Limit 1: Asset cannot depreciate more than (Price - 1) TOTAL.
            $max_depreciable = $price - 1;
            $remaining_capacity = $max_depreciable - $accumulated_dep;

            if ($remaining_capacity <= 0) {
                // Already fully depreciated in prior years
                $this_year_dep_gross = 0;
            } else {
                // Cap this year's depreciation
                if ($this_year_dep_gross > $remaining_capacity) {
                    $this_year_dep_gross = $remaining_capacity;
                }
            }

            // 5. Apply Business Ratio
            $this_year_dep_net = floor($this_year_dep_gross * $ratio);

            // 6. Update Asset Book Value (Idempotent Reset)
            // New Book Value = Price - (Prior Accum + This Year Gross)
            // Note: DB stores Book Value Gross? Usually yes. Business ratio applies to Expense Amount.
            // Wait, does Book Value track the "Asset Value" or "Business Portion"?
            // Usually Asset Value (Gross).
            // So we subtract GROSS depreciation from Book Value?
            // "Depreciation Expense" (Journal) is Net (Business %).
            // "Accumulated Depreciation" (Contra-Asset) is usually Gross?
            // If I buy a car for 1M (50% biz).
            // Year 1: Dep 250k. Expense 125k.
            // Book Value: 750k. (Asset is still worth 750k, regardless of ownership).
            // YES. Use GROSS for Book Value update.

            $new_book_value = $price - ($accumulated_dep + $this_year_dep_gross);

            // Safety:
            if ($new_book_value < 1)
                $new_book_value = 1;

            if ($this_year_dep_net > 0) {
                // Update DB
                $wpdb->update(
                    "{$wpdb->prefix}breeder_fixed_assets",
                    array('current_book_value' => $new_book_value),
                    array('id' => $asset->id),
                    array('%d'),
                    array('%d')
                );

                // Create JE (Net Amount)
                $id = $this->create_journal_entry(
                    $date,
                    'expense',
                    '減価償却費',
                    '',
                    $this_year_dep_net,
                    '減価償却費',
                    '工具器具備品',
                    "{$year}年度 減価償却 ({$asset->name})",
                    $asset->id
                );

                $total_depreciation += $this_year_dep_net;
                $entries[] = $id;
            } else {
                // Even if Dep is 0, we should arguably 'correct' the Book Value if it's wrong?
                // Optional. Let's do it to keep data clean.
                $wpdb->update(
                    "{$wpdb->prefix}breeder_fixed_assets",
                    array('current_book_value' => $new_book_value),
                    array('id' => $asset->id),
                    array('%d'),
                    array('%d')
                );
            }
        }

        return rest_ensure_response(array('success' => true, 'total' => $total_depreciation, 'entries' => $entries));
    }

    public function lock_year($request)
    {
        $params = $request->get_json_params();
        $year = intval($params['year']);
        update_option('breeder_accounting_locked_year', $year);
        return rest_ensure_response(array('success' => true, 'locked_year' => $year));
    }

    // --- Helpers ---

    private function delete_previous_entries($year, $description_pattern)
    {
        global $wpdb;
        $date = "{$year}-12-31";
        // Delete entries on closing date with specific pattern (Idempotency)
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->prefix}breeder_transactions 
             WHERE date = %s AND description LIKE %s",
            $date,
            $description_pattern
        ));
    }

    private function create_journal_entry($date, $type, $category, $sub_category, $amount, $debit_account, $credit_account, $description, $source_asset_id = 0)
    {
        global $wpdb;

        $c_allowance = '';
        $d_allowance = '';

        if ($type === 'expense') {
            $d_allowance = $debit_account;
            $c_allowance = $credit_account;
        } else {
            $d_allowance = $debit_account;
            $c_allowance = $credit_account;
        }

        $wpdb->insert(
            $wpdb->prefix . 'breeder_transactions',
            array(
                'date' => $date,
                'type' => $type,
                'category' => $category,
                'sub_category' => $sub_category,
                'description' => $description,
                'amount_gross' => $amount,
                'amount_net' => $amount,
                'fee' => 0,
                'payment_source' => 'adjustment',
                'status' => 'settled',
                'debit_allowance' => $d_allowance,
                'credit_allowance' => $c_allowance,
                'source_asset_id' => $source_asset_id
            ),
            array('%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%d')
        );
        return $wpdb->insert_id;
    }
}
