<?php
/**
 * Backup Helper Class
 */

if (!defined('ABSPATH')) {
    exit;
}

class Breeder_Accounting_Backup
{

    public function __construct()
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes()
    {
        register_rest_route('breeder/v1', '/backup', array(
            'methods' => 'GET',
            'callback' => array($this, 'export_data'),
            'permission_callback' => array($this, 'permissions_check'),
        ));

        register_rest_route('breeder/v1', '/restore', array(
            'methods' => 'POST',
            'callback' => array($this, 'restore_data'),
            'permission_callback' => array($this, 'permissions_check'),
        ));

        register_rest_route('breeder/v1', '/reset', array(
            'methods' => 'POST',
            'callback' => array($this, 'reset_data'),
            'permission_callback' => array($this, 'permissions_check'),
        ));
    }

    public function permissions_check()
    {
        return current_user_can('manage_options');
    }

    /**
     * Export All Data
     */
    public function export_data()
    {
        global $wpdb;

        $tables = array(
            'transactions' => $wpdb->prefix . 'breeder_transactions',
            'inventory' => $wpdb->prefix . 'breeder_inventory',
            'inventory_snapshots' => $wpdb->prefix . 'breeder_inventory_snapshots',
        );

        $data = array(
            'meta' => array(
                'version' => '1.0',
                'date' => current_time('mysql'),
                'plugin_version' => BREEDER_ACCOUNTING_VERSION
            ),
            'tables' => array(),
            'options' => array()
        );

        // Dump Tables
        $data['tables']['transactions'] = $wpdb->get_results("SELECT * FROM {$tables['transactions']}", ARRAY_A);
        $data['tables']['inventory'] = $wpdb->get_results("SELECT * FROM {$tables['inventory']}", ARRAY_A);
        $data['tables']['inventory_snapshots'] = $wpdb->get_results("SELECT * FROM {$tables['inventory_snapshots']}", ARRAY_A);

        // Dump Options
        $data['options']['breeder_accounting_settings'] = get_option('breeder_accounting_settings');
        $data['options']['breeder_accounting_settings_profile'] = get_option('breeder_accounting_settings_profile');
        $data['options']['breeder_accounting_settings_tax_history'] = get_option('breeder_accounting_settings_tax_history');
        $data['options']['breeder_accounting_settings_opening_balances'] = get_option('breeder_accounting_settings_opening_balances');

        return rest_ensure_response($data);
    }

    /**
     * Restore Data
     */
    public function restore_data($request)
    {
        global $wpdb;
        $params = $request->get_json_params();

        if (empty($params) || !isset($params['tables'])) {
            return new WP_Error('invalid_data', 'Invalid backup file', array('status' => 400));
        }

        // Tables
        $tables = array(
            'transactions' => $wpdb->prefix . 'breeder_transactions',
            'inventory' => $wpdb->prefix . 'breeder_inventory',
            'inventory_snapshots' => $wpdb->prefix . 'breeder_inventory_snapshots',
        );

        // 1. Truncate Tables
        foreach ($tables as $key => $table_name) {
            $wpdb->query("TRUNCATE TABLE $table_name");
        }

        // 2. Insert Data
        // Transactions
        if (!empty($params['tables']['transactions'])) {
            $this->bulk_insert($tables['transactions'], $params['tables']['transactions']);
        }
        // Inventory
        if (!empty($params['tables']['inventory'])) {
            $this->bulk_insert($tables['inventory'], $params['tables']['inventory']);
        }
        // Snapshots
        if (!empty($params['tables']['inventory_snapshots'])) {
            $this->bulk_insert($tables['inventory_snapshots'], $params['tables']['inventory_snapshots']);
        }

        // 3. Restore Options
        if (isset($params['options'])) {
            foreach ($params['options'] as $key => $value) {
                update_option($key, $value);
            }
        }

        return rest_ensure_response(array('message' => 'Restore successful', 'count' => count($params['tables']['transactions'])));
    }

    /**
     * Helper: Bulk Insert
     * Naive implementation: loop insert. Safer than constructing huge SQL strings.
     */
    private function bulk_insert($table_name, $rows)
    {
        global $wpdb;
        foreach ($rows as $row) {
            $format = array();
            foreach ($row as $val) {
                $format[] = '%s'; // Treat everything as string for simplicity, WP handles strict types okay usually
            }
            $wpdb->insert($table_name, $row, $format);
        }
    }

    /**
     * Reset Data (Factory Reset)
     */
    public function reset_data($request)
    {
        global $wpdb;

        $tables = array(
            $wpdb->prefix . 'breeder_transactions',
            $wpdb->prefix . 'breeder_inventory',
            $wpdb->prefix . 'breeder_inventory_snapshots',
            $wpdb->prefix . 'breeder_fixed_assets'
        );

        foreach ($tables as $table) {
            $wpdb->query("TRUNCATE TABLE $table");
        }

        // Options Reset? Maybe keep profile? 
        // User asked for "Delete All Data". Usually implies transaction data.
        // Let's Keep Profile/Settings to avoid annoyance, but clear tax history and opening balances?
        // Let's JUST clear tables for now as that's the main data.
        // If they want full reset, they can reinstall.
        // Let's clear Opening Balances as that is data-related.
        delete_option('breeder_accounting_settings_opening_balances');

        // FIX: Also clear the Locked Year status!
        delete_option('breeder_accounting_locked_year');

        return rest_ensure_response(array('message' => 'All data reset.'));
    }
}
