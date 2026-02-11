<?php
/**
 * Fixed Assets REST Controller
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Assets
{

    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes()
    {
        register_rest_route('breeder/v1', '/assets', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_items'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_item'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));

        register_rest_route('breeder/v1', '/assets/(?P<id>\d+)/dispose', array(
            'methods' => 'POST',
            'callback' => array($this, 'dispose_item'),
            'permission_callback' => array($this, 'permissions_check'),
        ));
    }

    public function permissions_check()
    {
        return current_user_can('manage_options');
    }

    /**
     * Get Items
     */
    public function get_items($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_fixed_assets';

        $results = $wpdb->get_results("SELECT * FROM $table_name WHERE deleted_at IS NULL ORDER BY purchase_date DESC", ARRAY_A);

        return rest_ensure_response(array('items' => $results));
    }

    /**
     * Create Item
     */
    public function create_item($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_fixed_assets';

        $params = $request->get_params();

        $name = sanitize_text_field($params['name']);
        $purchase_date = sanitize_text_field($params['purchase_date']);
        $purchase_price = intval($params['purchase_price']);
        $lifespan_years = intval($params['lifespan_years']);
        $method = sanitize_text_field($params['method']); // STRAIGHT_LINE or ONE_TIME
        $business_ratio = isset($params['business_ratio']) ? intval($params['business_ratio']) : 100;
        $notes = sanitize_textarea_field($params['notes']);

        // Initial Book Value = Purchase Price
        $current_book_value = $purchase_price;

        $inserted = $wpdb->insert(
            $table_name,
            array(
                'name' => $name,
                'purchase_date' => $purchase_date,
                'service_date' => !empty($params['service_date']) ? sanitize_text_field($params['service_date']) : null,
                'purchase_price' => $purchase_price,
                'lifespan_years' => $lifespan_years,
                'method' => $method,
                'business_ratio' => $business_ratio,
                'current_book_value' => $current_book_value,
                'notes' => $notes,
                'status' => 'ACTIVE'
            ),
            array('%s', '%s', '%s', '%d', '%d', '%s', '%d', '%d', '%s')
        );

        if (!$inserted) {
            return new WP_Error('db_error', 'Could not insert asset.', array('status' => 500));
        }

        return rest_ensure_response(array('id' => $wpdb->insert_id, 'message' => 'Asset created'));
    }

    /**
     * Update Item
     */
    public function update_item($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_fixed_assets';
        $id = $request->get_param('id');
        $params = $request->get_params();

        // Check exists
        $current = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table_name WHERE id = %d", $id), ARRAY_A);
        if (!$current) {
            return new WP_Error('not_found', 'Item not found', array('status' => 404));
        }

        $data = array();
        if (isset($params['name']))
            $data['name'] = sanitize_text_field($params['name']);
        if (isset($params['purchase_date']))
            $data['purchase_date'] = sanitize_text_field($params['purchase_date']);
        if (isset($params['service_date']))
            $data['service_date'] = sanitize_text_field($params['service_date']);
        if (isset($params['purchase_price']))
            $data['purchase_price'] = intval($params['purchase_price']);
        if (isset($params['lifespan_years']))
            $data['lifespan_years'] = intval($params['lifespan_years']);
        if (isset($params['method']))
            $data['method'] = sanitize_text_field($params['method']);
        if (isset($params['business_ratio']))
            $data['business_ratio'] = intval($params['business_ratio']);
        if (isset($params['status']))
            $data['status'] = sanitize_text_field($params['status']);
        if (isset($params['notes']))
            $data['notes'] = sanitize_textarea_field($params['notes']);
        if (isset($params['current_book_value']))
            $data['current_book_value'] = intval($params['current_book_value']);

        $wpdb->update($table_name, $data, array('id' => $id));

        return rest_ensure_response(array('message' => 'Updated'));
    }

    /**
     * Delete Item (Mistake Correction)
     */
    public function delete_item($request)
    {
        global $wpdb;
        $table_assets = $wpdb->prefix . 'breeder_fixed_assets';
        $table_transactions = $wpdb->prefix . 'breeder_transactions';
        $id = $request->get_param('id');

        // Check existence logic
        $asset = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table_assets WHERE id = %d", $id));
        if (!$asset) {
            return new WP_Error('not_found', 'Asset not found', array('status' => 404));
        }

        // 1. Soft Delete Linked Transactions (JEs)
        $now = current_time('mysql');
        $wpdb->update(
            $table_transactions,
            array('deleted_at' => $now),
            array('source_asset_id' => $id),
            array('%s'),
            array('%d')
        );

        // Fallback: Legacy Description Match
        // Also Soft Delete these?
        // Note: WPDB UPDATE usually doesn't support complex JOIN/Subquery in standard method easily
        // but simple WHERE is fine.
        $name_like = '%' . $wpdb->esc_like($asset->name) . '%';
        // We can't use $wpdb->update simply with LIKE? Yes we can if we construct WHERE manually?
        // Actually $wpdb->update takes WHERE array.
        // For LIKE, we use $wpdb->query.
        $wpdb->query($wpdb->prepare(
            "UPDATE $table_transactions 
             SET deleted_at = %s 
             WHERE description LIKE %s 
             AND category IN ('減価償却費', '固定資産除却損')",
            $now,
            $name_like
        ));

        // 2. Soft Delete Asset
        $wpdb->update(
            $table_assets,
            array('deleted_at' => $now),
            array('id' => $id),
            array('%s'),
            array('%d')
        );

        return rest_ensure_response(array('message' => 'Asset and related journals deleted'));
    }

    /**
     * Dispose Item (Scrap/Sell)
     */
    public function dispose_item($request)
    {
        global $wpdb;
        $id = $request->get_param('id');
        $params = $request->get_params();

        $dispose_date = sanitize_text_field($params['date']); // YYYY-MM-DD
        $type = sanitize_text_field($params['type']); // 'SCRAP' or 'SELL'
        $note = isset($params['note']) ? sanitize_textarea_field($params['note']) : '';

        // Fetch Asset
        $asset = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}breeder_fixed_assets WHERE id = %d", $id));
        if (!$asset) {
            return new WP_Error('not_found', 'Asset not found', array('status' => 404));
        }

        if ($asset->status === 'DISPOSED') {
            return new WP_Error('already_disposed', 'Asset is already disposed', array('status' => 400));
        }

        // --- ROB ROBUST CALCULATION ---
        $current_year = substr($dispose_date, 0, 4);
        $jan_1 = new DateTime("$current_year-01-01");
        $disp_dt = new DateTime($dispose_date);
        $purchase_dt = new DateTime($asset->purchase_date);
        $purchase_year = $purchase_dt->format('Y');

        $price = intval($asset->purchase_price);
        $lifespan = intval($asset->lifespan_years);
        $ratio = intval($asset->business_ratio) / 100;

        // 1. Calculate Theoretical Opening Book Value
        // Calculate years passed BEFORE this year
        $passed_years = intval($current_year) - intval($purchase_year);
        $opening_book_value = $price;

        if ($lifespan > 0) {
            if ($passed_years >= $lifespan) {
                // Lifespan exceeded (or reached) in previous years
                $opening_book_value = 1;
            } elseif ($passed_years > 0) {
                // Calculate accumulated depreciation for past years using strict floor logic
                $accumulated = 0;
                $yearly_dep_full = floor($price / $lifespan);

                // Loop through prior years to accumulate dep (handling first year proration if needed)
                for ($y = $purchase_year; $y < $current_year; $y++) {
                    $months = 12;
                    if ($y == $purchase_year) {
                        $m_purchase = $purchase_dt->format('n');
                        $months = 12 - $m_purchase + 1;
                    }
                    $dep_y = floor($yearly_dep_full * ($months / 12));
                    $accumulated += $dep_y;
                }
                $opening_book_value = max(1, $price - $accumulated);
            }
        }

        // 2. Term Depreciation (capped at Opening Book Value - 1)
        $term_dep_gross = 0;
        $months_used = 0;

        if ($opening_book_value > 1 && $lifespan > 0) {
            // Months used this year (Effective)
            $start_month_num = 1;
            if ($purchase_dt->format('Y') === $current_year) {
                $start_month_num = intval($purchase_dt->format('n'));
            }
            $end_month_num = intval($disp_dt->format('n'));

            $months_used = $end_month_num - $start_month_num + 1;
            if ($months_used < 0)
                $months_used = 0;
            if ($months_used > 12)
                $months_used = 12;

            $annual_dep = floor($price / $lifespan);
            $calculated_dep = floor($annual_dep * ($months_used / 12));

            $max_depreciable = $opening_book_value - 1;
            $term_dep_gross = min($calculated_dep, $max_depreciable);
            if ($term_dep_gross < 0)
                $term_dep_gross = 0;
        }

        // 3. Remaining (Loss)
        $remaining = $opening_book_value - $term_dep_gross;
        if ($remaining < 0)
            $remaining = 0;

        // Apply Limit? 1 JPY rule?
        // If Type == SCRAP (Total Loss), we expense everything except maybe 1 JPY if we keep it? 
        // User said: "Dispose -> 1 yen residual? No, Scrap -> 1 yen if leaving on ledger? 
        // But here we are removing it. So 1 yen becomes expense too?
        // User said: "(借) 固定資産除却損 1 (貸) 工具器具備品 1". If partial: Dep + Loss(Rem).
        // So yes, we expense EVERYTHING. Book Value becomes 0. 
        // Wait, if 1 yen memo is required, status is 'DISPOSED' but we keep it?
        // No, Status 'DISPOSED' implies it's gone.

        $entries = [];

        // 1. Term Depreciation (Expense)
        if ($term_dep_gross > 0) {
            $term_dep_net = floor($term_dep_gross * $ratio); // Apply Ratio
            // But wait, Book Value reduction is GROSS.
            // Expense is NET.
            // What about the Private portion of depreciation? It is just ignored expense.
            // But Book Value reduces by GROSS.

            if ($term_dep_net > 0) {
                $id_dep = $this->create_journal_entry(
                    $dispose_date,
                    'expense',
                    '減価償却費',
                    '',
                    $term_dep_net,
                    '減価償却費',
                    '工具器具備品',
                    "{$current_year}年度 途中除却償却 ({$months_used}ヶ月分) - {$asset->name}",
                    $asset->id
                );
            }
        }

        // 2. Loss (Expense)
        // Loss Amount = Remaining (Gross).
        // Does Business Ratio apply to Loss?
        // If I scrap a 50% biz car, is the loss 50% deductible?
        // Yes, usually.
        // So Loss = Remaining * Ratio.

        $loss_gross = $remaining;
        if ($loss_gross < 0)
            $loss_gross = 0; // Should not happen

        $loss_net = floor($loss_gross * $ratio);

        if ($loss_net > 0) {
            $id_loss = $this->create_journal_entry(
                $dispose_date,
                'expense',
                '固定資産除却損',
                '',
                $loss_net,
                '固定資産除却損',
                '工具器具備品',
                "除却損 ({$type}) - {$asset->name}",
                $asset->id
            );
        }

        // 3. Update Asset
        $wpdb->update(
            "{$wpdb->prefix}breeder_fixed_assets",
            array(
                'status' => 'DISPOSED',
                'current_book_value' => 0, // Zero out
                'notes' => $asset->notes . "\nDisposed: $dispose_date ($type). $note"
            ),
            array('id' => $id)
        );

        return rest_ensure_response(array('success' => true));
    }

    private function create_journal_entry($date, $type, $category, $sub_category, $amount, $debit_account, $credit_account, $description, $source_asset_id = 0)
    {
        global $wpdb;

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
                'debit_allowance' => $debit_account, // Direct mapping if passed correctly
                'credit_allowance' => $credit_account, // Direct mapping
                'source_asset_id' => $source_asset_id
            ),
            array('%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%d')
        );
        return $wpdb->insert_id;
    }
}
