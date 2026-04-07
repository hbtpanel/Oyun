<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'oyun');
define('DB_USER', 'oyun');
define('DB_PASS', 'iyF3mtT!@Vv8o2nr');

try {
    $pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8', DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die('Veritabanı bağlantı hatası: ' . $e->getMessage());
}
?>