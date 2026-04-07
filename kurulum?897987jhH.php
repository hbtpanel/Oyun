<?php
// Eğer sistem zaten kuruluysa (config.php varsa) kurulum ekranını engelle
if (file_exists('config.php')) {
    die("<div style='font-family:sans-serif; text-align:center; margin-top:50px; color:#e74c3c;'>
            <h2>Sistem Zaten Kurulu!</h2>
            <p>Güvenliğiniz için lütfen <b>kurulum.php</b> dosyasını sunucudan silin.</p>
         </div>");
}

$mesaj = '';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $db_host = trim($_POST['db_host']);
    $db_name = trim($_POST['db_name']);
    $db_user = trim($_POST['db_user']);
    $db_pass = trim($_POST['db_pass']);

    try {
        // 1. Veritabanına Bağlanmayı Dene
        $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // 2. Tabloları Otomatik Oluştur
        $sql = "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_saves (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            level INT DEFAULT 1,
            points INT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        ";
        $pdo->exec($sql);

        // 3. config.php Dosyasını Oluştur (Sonraki bağlantılar için)
        $config_icerik = "<?php\n";
        $config_icerik .= "define('DB_HOST', '$db_host');\n";
        $config_icerik .= "define('DB_NAME', '$db_name');\n";
        $config_icerik .= "define('DB_USER', '$db_user');\n";
        $config_icerik .= "define('DB_PASS', '$db_pass');\n\n";
        $config_icerik .= "try {\n";
        $config_icerik .= "    \$pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8', DB_USER, DB_PASS);\n";
        $config_icerik .= "    \$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);\n";
        $config_icerik .= "} catch (PDOException \$e) {\n";
        $config_icerik .= "    die('Veritabanı bağlantı hatası: ' . \$e->getMessage());\n";
        $config_icerik .= "}\n";
        $config_icerik .= "?>";

        file_put_contents('config.php', $config_icerik);

        $mesaj = "<div class='success'>Kurulum Başarılı! Tablolar oluşturuldu. Lütfen kurulum.php dosyasını silin.</div>";

    } catch (PDOException $e) {
        $mesaj = "<div class='error'>Hata: Veritabanına bağlanılamadı! Bilgileri kontrol edin.<br> Detay: " . $e->getMessage() . "</div>";
    }
}
?>

<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Oyun Veritabanı Kurulumu</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #2c3e50; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .install-box { background-color: #1a252f; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 400px; }
        h2 { text-align: center; color: #f1c40f; margin-top: 0; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: #bdc3c7; }
        input[type="text"], input[type="password"] { width: 100%; padding: 12px; border: 1px solid #34495e; border-radius: 5px; background: #2c3e50; color: white; box-sizing: border-box; }
        input:focus { border-color: #f1c40f; outline: none; }
        button { width: 100%; padding: 15px; background-color: #27ae60; border: none; color: white; font-size: 16px; font-weight: bold; border-radius: 5px; cursor: pointer; transition: 0.3s; }
        button:hover { background-color: #2ecc71; }
        .error { background-color: #e74c3c; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-size: 14px; }
        .success { background-color: #2ecc71; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-size: 14px; text-align:center; }
    </style>
</head>
<body>

<div class="install-box">
    <h2>Sistem Kurulum Sihirbazı</h2>
    <?php echo $mesaj; ?>
    
    <?php if (!file_exists('config.php')): ?>
    <form method="POST" action="">
        <div class="form-group">
            <label>Veritabanı Sunucusu (Genelde localhost)</label>
            <input type="text" name="db_host" value="localhost" required>
        </div>
        <div class="form-group">
            <label>Veritabanı Adı</label>
            <input type="text" name="db_name" required>
        </div>
        <div class="form-group">
            <label>Veritabanı Kullanıcı Adı</label>
            <input type="text" name="db_user" required>
        </div>
        <div class="form-group">
            <label>Veritabanı Şifresi</label>
            <input type="password" name="db_pass">
        </div>
        <button type="submit">Sistemi Kur</button>
    </form>
    <?php endif; ?>
</div>

</body>
</html>