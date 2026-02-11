<?php
/**
 * Inventory REST Controller
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Inventory
{

    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes()
    {
        register_rest_route('breeder/v1', '/inventory', array(
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

        register_rest_route('breeder/v1', '/inventory/(?P<id>\d+)', array(
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_item'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_item'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));

        register_rest_route('breeder/v1', '/inventory/snapshot', array(
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_snapshot'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_snapshots'),
                'permission_callback' => array($this, 'permissions_check'),
            ),
        ));
    }

    // ... items methods ...

    /**
     * Create Snapshot (Year-End)
     */
    public function create_snapshot($request)
    {
        global $wpdb;
        $table_inv = $wpdb->prefix . 'breeder_inventory';
        $table_snap = $wpdb->prefix . 'breeder_inventory_snapshots';

        $params = $request->get_params();
        $year = isset($params['year']) ? intval($params['year']) : intval(date('Y'));

        // Fetch Active Inventory
        $items = $wpdb->get_results("SELECT * FROM $table_inv WHERE status = 'ACTIVE'", ARRAY_A);

        $total_val = 0;
        foreach ($items as $item) {
            $total_val += ($item['quantity'] * $item['cost_price']);
        }

        // Save
        $data_json = json_encode($items, JSON_UNESCAPED_UNICODE);

        // Check if exists for year? Overwrite?
        $exists = $wpdb->get_row($wpdb->prepare("SELECT id FROM $table_snap WHERE year = %d", $year));

        if ($exists) {
            $updated = $wpdb->update($table_snap, array(
                'snapshot_date' => date('Y-12-31', strtotime("$year-12-31")), // Fixed date usually
                'data_json' => $data_json,
                'total_valuation' => $total_val
            ), array('id' => $exists->id));

            if ($updated === false) {
                return new WP_Error('db_error', 'Could not update snapshot.', array('status' => 500));
            }
        } else {
            $inserted = $wpdb->insert($table_snap, array(
                'year' => $year,
                'snapshot_date' => date('Y-12-31', strtotime("$year-12-31")),
                'data_json' => $data_json,
                'total_valuation' => $total_val
            ));

            if (!$inserted) {
                return new WP_Error('db_error', 'Could not insert snapshot. Table might be missing.', array('status' => 500));
            }
        }

        return rest_ensure_response(array('message' => 'Snapshot saved', 'year' => $year, 'valuation' => $total_val));
    }

    /**
     * Get Snapshots
     */
    public function get_snapshots($request)
    {
        global $wpdb;
        $table_snap = $wpdb->prefix . 'breeder_inventory_snapshots';
        $results = $wpdb->get_results("SELECT * FROM $table_snap ORDER BY year DESC", ARRAY_A);
        return rest_ensure_response($results);
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
        $table_name = $wpdb->prefix . 'breeder_inventory';

        // Filters
        $status = $request->get_param('status') ? sanitize_text_field($request->get_param('status')) : '';

        $where = "1=1";
        if ($status) {
            $where .= $wpdb->prepare(" AND status = %s", $status);
        } else {
            // Default: Show ACTIVE only unless specified? Or all?
            // Let's show all by default, or ACTIVE.
            // Actually, usually we want to see active inventory.
        }

        $results = $wpdb->get_results("SELECT * FROM $table_name WHERE $where ORDER BY purchase_date DESC", ARRAY_A);

        // Calculate Valuation (Total)
        $valuation = 0;
        foreach ($results as $row) {
            if ($row['status'] === 'ACTIVE') {
                $valuation += ($row['quantity'] * $row['cost_price']);
            }
        }

        return rest_ensure_response(array(
            'items' => $results,
            'total_valuation' => $valuation
        ));
    }

    /**
     * Create Item
     */
    public function create_item($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_inventory';

        $params = $request->get_params();

        $name = sanitize_text_field($params['name']);
        $source_type = sanitize_text_field($params['source_type']); // PURCHASED, BRED, SUPPLY
        $quantity = intval($params['quantity']);
        $cost_price = intval($params['cost_price']);
        $purchase_date = sanitize_text_field($params['purchase_date']);
        $notes = sanitize_textarea_field($params['notes']);

        // Logic: If BRED, cost_price force to 0?
        if ($source_type === 'BRED') {
            $cost_price = 0;
        }

        $inserted = $wpdb->insert(
            $table_name,
            array(
                'name' => $name,
                'source_type' => $source_type,
                'quantity' => $quantity,
                'cost_price' => $cost_price,
                'purchase_date' => $purchase_date,
                'notes' => $notes,
                'status' => 'ACTIVE'
            ),
            array('%s', '%s', '%d', '%d', '%s', '%s', '%s')
        );

        if (!$inserted) {
            return new WP_Error('db_error', 'Could not insert inventory.', array('status' => 500));
        }

        return rest_ensure_response(array('id' => $wpdb->insert_id, 'message' => 'Inventory created'));
    }

    /**
     * Update Item
     */
    public function update_item($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_inventory';
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
        if (isset($params['source_type']))
            $data['source_type'] = sanitize_text_field($params['source_type']);
        if (isset($params['quantity']))
            $data['quantity'] = intval($params['quantity']);
        if (isset($params['cost_price']))
            $data['cost_price'] = intval($params['cost_price']);
        if (isset($params['purchase_date']))
            $data['purchase_date'] = sanitize_text_field($params['purchase_date']);
        if (isset($params['status']))
            $data['status'] = sanitize_text_field($params['status']);
        if (isset($params['notes']))
            $data['notes'] = sanitize_textarea_field($params['notes']);

        // Logic enforcement
        if (isset($data['source_type']) && $data['source_type'] === 'BRED') {
            $data['cost_price'] = 0;
        }

        $wpdb->update($table_name, $data, array('id' => $id));

        return rest_ensure_response(array('message' => 'Updated'));
    }

    /**
     * Delete Item
     */
    public function delete_item($request)
    {
        global $wpdb;
        $table_name = $wpdb->prefix . 'breeder_inventory';
        $id = $request->get_param('id');

        $wpdb->delete($table_name, array('id' => $id));
        return rest_ensure_response(array('message' => 'Deleted'));
    }
}
