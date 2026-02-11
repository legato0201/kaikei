<?php
/**
 * Plugin Name: Breeder Accounting
 * Description: A dedicated accounting plugin for breeders, fully integrated with double-entry bookkeeping.
 * Version: 1.0.0
 * Author: Antigravity
 * Text Domain: breeder-accounting
 */

if (!defined('ABSPATH')) {
    exit;
}

// Define Constants
define('BREEDER_ACCOUNTING_VERSION', '1.3.1');
define('BREEDER_ACCOUNTING_PATH', plugin_dir_path(__FILE__));
define('BREEDER_ACCOUNTING_URL', plugin_dir_url(__FILE__));

// Include DB Class
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-db.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-rest-controller.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-export.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-inventory.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-assets.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-reports.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-year-end-controller.php';
require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-etax.php';

/**
 * Main Plugin Class
 */
class Breeder_Accounting
{

    /**
     * Instance
     *
     * @var Breeder_Accounting
     */
    private static $instance = null;

    /**
     * Get Instance
     *
     * @return Breeder_Accounting
     */
    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct()
    {
        // Activation Hook
        register_activation_hook(__FILE__, array('Breeder_Accounting_DB', 'create_table'));

        // Auto Migration Check (plugins_loaded is early enough)
        add_action('plugins_loaded', array($this, 'check_version'));

        // Admin Menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // REST API Init
        add_action('rest_api_init', array($this, 'init_rest_api'));

        // Enqueue Scripts
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));

        // AJAX File Proxy
        add_action('wp_ajax_breeder_view_receipt', array($this, 'handle_view_receipt'));
    }

    /**
     * Handle File Proxy Request
     * Prevents 403/Forbidden issues by serving file via PHP.
     */
    public function handle_view_receipt()
    {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        $file_path = isset($_GET['file']) ? $_GET['file'] : '';
        if (empty($file_path)) {
            wp_die('No file specified');
        }

        // Security: Prevent Directory Traversal
        // Expected format: 2026/filename.jpg
        $parts = explode('/', $file_path);
        if (count($parts) !== 2) {
            wp_die('Invalid file path format');
        }

        $year = intval($parts[0]);
        $filename = basename($parts[1]);

        // Validate Year
        if ($year < 2000 || $year > 3000) {
            wp_die('Invalid year');
        }

        // Construct Absolute Path
        // We know uploads are at wp-content/uploads/breeder-receipts
        $upload_dir = wp_upload_dir();
        // breeder-receipts is inside basedir
        $target_file = $upload_dir['basedir'] . '/breeder-receipts/' . $year . '/' . $filename;

        if (!file_exists($target_file)) {
            wp_die('File not found: ' . esc_html($file_path));
        }

        // Determine MIME Type
        $mime_type = mime_content_type($target_file);
        if (!$mime_type) {
            $ext = strtolower(pathinfo($target_file, PATHINFO_EXTENSION));
            switch ($ext) {
                case 'jpg':
                case 'jpeg':
                    $mime_type = 'image/jpeg';
                    break;
                case 'png':
                    $mime_type = 'image/png';
                    break;
                case 'pdf':
                    $mime_type = 'application/pdf';
                    break;
                default:
                    $mime_type = 'application/octet-stream';
                    break;
            }
        }

        // Serve Headers
        header('Content-Type: ' . $mime_type);
        header('Content-Length: ' . filesize($target_file));
        header('Content-Disposition: inline; filename="' . $filename . '"');

        // Output File
        readfile($target_file);
        exit;
    }

    /**
     * Check Version & Run Migration
     */
    public function check_version()
    {
        $installed_version = get_option('breeder_accounting_version');

        if ($installed_version !== BREEDER_ACCOUNTING_VERSION) {
            Breeder_Accounting_DB::create_table();
            update_option('breeder_accounting_version', BREEDER_ACCOUNTING_VERSION);
        }
    }

    /**
     * Init REST API
     */
    public function init_rest_api()
    {
        $controller = new Breeder_Accounting_REST_Controller();
        $controller->register_routes();

        $inventory_controller = new Breeder_Accounting_Inventory();
        $inventory_controller->register_routes();

        $assets_controller = new Breeder_Accounting_Assets();
        $assets_controller->register_routes();

        $reports_controller = new Breeder_Accounting_Reports();
        $reports_controller->register_routes();

        $year_end_controller = new Breeder_Accounting_Year_End_Controller();
        $year_end_controller->register_routes();

        $etax_controller = new Breeder_Accounting_ETax();
        $etax_controller->register_routes();

        // Backup Controller
        require_once BREEDER_ACCOUNTING_PATH . 'includes/class-breeder-accounting-backup.php';
        $backup_controller = new Breeder_Accounting_Backup();
        $backup_controller->register_routes();
    }


    /**
     * Add Admin Menu
     */
    public function add_admin_menu()
    {
        add_menu_page(
            'Breeder Accounting',
            'Breeder Accounting',
            'manage_options',
            'breeder-accounting',
            array($this, 'render_admin_page'),
            'dashicons-chart-line',
            30
        );
    }

    /**
     * Render Admin Page
     */
    public function render_admin_page()
    {
        echo '<div id="breeder-accounting-app"></div>';
    }

    /**
     * Enqueue Scripts
     *
     * @param string $hook Hook suffix.
     */
    public function enqueue_scripts($hook)
    {
        if ('toplevel_page_breeder-accounting' !== $hook) {
            return;
        }

        $asset_file = include BREEDER_ACCOUNTING_PATH . 'build/index.asset.php';

        if (!file_exists(BREEDER_ACCOUNTING_PATH . 'build/index.asset.php')) {
            return;
        }

        wp_enqueue_script(
            'breeder-accounting-script',
            BREEDER_ACCOUNTING_URL . 'build/index.js',
            $asset_file['dependencies'],
            $asset_file['version'] . '.' . time(), // Hotfix: Force cache bust
            true
        );

        wp_enqueue_style(
            'breeder-accounting-style',
            BREEDER_ACCOUNTING_URL . 'build/index.css',
            array('wp-components'),
            $asset_file['version']
        );

        // Pass nonce and settings to JS
        wp_localize_script(
            'breeder-accounting-script',
            'breederAccountingSettings',
            array(
                'root' => esc_url_raw(rest_url()),
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('wp_rest'),
                'pluginUrl' => BREEDER_ACCOUNTING_URL,
                'settings' => get_option('breeder_accounting_settings', array()), // Legacy/General Settings
                'profile' => get_option('breeder_accounting_settings_profile', null), // New Profile Settings
                'lockedYear' => intval(get_option('breeder_accounting_locked_year', 0)),
            )
        );
    }
}

// Initialize Plugin
Breeder_Accounting::get_instance();
