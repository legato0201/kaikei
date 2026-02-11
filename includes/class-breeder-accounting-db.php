<?php
/**
 * Database Handler Class
 */

if (!defined('ABSPATH')) {
	exit;
}

class Breeder_Accounting_DB
{

	/**
	 * Create Database Table
	 */
	public static function create_table()
	{
		global $wpdb;

		$table_name = $wpdb->prefix . 'breeder_transactions';
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE $table_name (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			date date NOT NULL,
			type enum('income', 'expense') NOT NULL,
			category varchar(100) NOT NULL,
			sub_category varchar(100) DEFAULT '',
			description text NOT NULL,
			amount_gross int(11) NOT NULL,
			fee int(11) NOT NULL DEFAULT 0,
            shipping_fee int(11) NOT NULL DEFAULT 0,
			amount_net int(11) NOT NULL,
			payment_source varchar(50) DEFAULT '',
			is_husband_paid boolean DEFAULT false,
			partner_name varchar(255) DEFAULT '',
			tax_rate int(2) DEFAULT 10,
			invoice_no varchar(50) DEFAULT '',
			debit_allowance varchar(100) DEFAULT '',
			credit_allowance varchar(100) DEFAULT '',
			status enum('settled', 'unsettled') DEFAULT 'settled',
			deposit_date date DEFAULT NULL,
			receipt_path varchar(255) DEFAULT '',
            is_delayed boolean DEFAULT false,
            deleted_at datetime DEFAULT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			parent_id bigint(20) DEFAULT 0,
            source_asset_id bigint(20) DEFAULT 0,
			PRIMARY KEY  (id),
            KEY date (date),
            KEY payment_source (payment_source),
            KEY category (category),
            KEY partner_name (partner_name)
		) $charset_collate;";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta($sql);

		// Inventory Table
		$table_inventory = $wpdb->prefix . 'breeder_inventory';
		$sql_inv = "CREATE TABLE $table_inventory (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            name varchar(255) NOT NULL,
            source_type enum('PURCHASED', 'BRED', 'SUPPLY') NOT NULL DEFAULT 'BRED',
            purchase_date date DEFAULT NULL,
            quantity int(11) NOT NULL DEFAULT 0,
            cost_price int(11) NOT NULL DEFAULT 0,
            status enum('ACTIVE', 'SOLD', 'DEAD', 'USED') DEFAULT 'ACTIVE',
            notes text,
            transaction_id bigint(20) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id)
        ) $charset_collate;";

		dbDelta($sql_inv);

		// Inventory Snapshots Table
		$table_snapshots = $wpdb->prefix . 'breeder_inventory_snapshots';
		$sql_snap = "CREATE TABLE $table_snapshots (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			year int(4) NOT NULL,
			snapshot_date date NOT NULL,
			total_valuation int(11) NOT NULL DEFAULT 0,
			data_json longtext,
			created_at datetime DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY year (year)
		) $charset_collate;";

		dbDelta($sql_snap);

		// Fixed Assets Table
		$table_assets = $wpdb->prefix . 'breeder_fixed_assets';
		$sql_assets = "CREATE TABLE $table_assets (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL,
			purchase_date date NOT NULL,
            service_date date DEFAULT NULL,
			purchase_price int(11) NOT NULL DEFAULT 0,
			lifespan_years int(11) NOT NULL DEFAULT 0,
			method varchar(50) NOT NULL DEFAULT 'STRAIGHT_LINE',
			business_ratio int(3) NOT NULL DEFAULT 100,
			current_book_value int(11) NOT NULL DEFAULT 0,
			status varchar(50) DEFAULT 'ACTIVE',
			notes text,
            deleted_at datetime DEFAULT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY  (id)
		) $charset_collate;";

		dbDelta($sql_assets);

		// Audit Log Table (For Electronic Book Compliance DB-07)
		$table_audit = $wpdb->prefix . 'breeder_audit_log';
		$sql_audit = "CREATE TABLE $table_audit (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            transaction_id bigint(20) NOT NULL,
            action enum('update', 'delete') NOT NULL,
            old_data longtext,
            new_data longtext,
            changed_by bigint(20) NOT NULL,
            changed_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY transaction_id (transaction_id)
        ) $charset_collate;";

		dbDelta($sql_audit);
	}
}
