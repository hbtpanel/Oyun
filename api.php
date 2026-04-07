<?php
// Gelen veri formatını JSON olarak ayarla
header('Content-Type: application/json');

// Eğer kurulum yapılmadıysa işlemi durdur
if (!file_exists('config.php')) {
    echo json_encode(['success' => false, 'message' => 'Sistem henüz kurulmamış! Lütfen kurulum.php çalıştırın.']);
    exit;
}

require 'config.php';

// JavaScript (Fetch API) üzerinden gelen JSON verisini al
$data = json_decode(file_get_contents('php://input'), true);
$action = $_GET['action'] ?? '';

// --- YENİ KAYIT ---
if ($action === 'register') {
    $username = trim($data['username'] ?? '');
    $password = trim($data['password'] ?? '');

    if (strlen($username) < 3 || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'İsim en az 3 harf olmalı ve parola boş olmamalı!']);
        exit;
    }

    // İsim daha önce alınmış mı kontrol et
    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => false, 'message' => 'Bu isimde bir büyücü zaten var!']);
        exit;
    }

    // Kullanıcıyı veritabanına ekle (Şifreyi güvenli Hash ile kaydet)
    $stmt = $pdo->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
    $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
    $userId = $pdo->lastInsertId();

    // Yeni kullanıcı için oyun kaydını başlat (1. Seviye, 0 Puan)
    $stmt = $pdo->prepare("INSERT INTO game_saves (user_id, level, points) VALUES (?, 1, 0)");
    $stmt->execute([$userId]);

    echo json_encode(['success' => true, 'level' => 1, 'points' => 0]);
}

// --- GİRİŞ YAP ---
elseif ($action === 'login') {
    $username = trim($data['username'] ?? '');
    $password = trim($data['password'] ?? '');

    $stmt = $pdo->prepare("SELECT id, password FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    // Şifre doğruysa
    if ($user && password_verify($password, $user['password'])) {
        $stmt = $pdo->prepare("SELECT level, points FROM game_saves WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $save = $stmt->fetch();

        echo json_encode([
            'success' => true,
            'level' => $save ? (int)$save['level'] : 1,
            'points' => $save ? (int)$save['points'] : 0
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Hatalı isim veya şifre!']);
    }
}

// --- OYUNU KAYDET ---
elseif ($action === 'save') {
    $username = trim($data['username'] ?? '');
    $level = (int)($data['level'] ?? 1);
    $points = (int)($data['points'] ?? 0);

    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user) {
        $stmt = $pdo->prepare("UPDATE game_saves SET level = ?, points = ? WHERE user_id = ?");
        $stmt->execute([$level, $points, $user['id']]); // DÜZELTİLDİ: $points eklendi
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Kullanıcı bulunamadı.']);
    }
}

// --- GÜNCEL DURUMU GETİR (SENKRONİZASYON İÇİN) ---
elseif ($action === 'get_progress') {
    $username = trim($data['username'] ?? '');
    
    $stmt = $pdo->prepare("SELECT g.level, g.points FROM game_saves g JOIN users u ON g.user_id = u.id WHERE u.username = ?");
    $stmt->execute([$username]);
    $save = $stmt->fetch();

    if ($save) {
        echo json_encode(['success' => true, 'level' => (int)$save['level'], 'points' => (int)$save['points']]);
    } else {
        echo json_encode(['success' => false]);
    }
}
// --- LİDERLİK TABLOSU ---
elseif ($action === 'leaderboard') {
    $stmt = $pdo->query("
        SELECT u.username, g.level, g.points 
        FROM game_saves g 
        JOIN users u ON g.user_id = u.id 
        ORDER BY g.level DESC, g.points DESC 
        LIMIT 10
    ");
    $leaders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($leaders);
}

else {
    echo json_encode(['success' => false, 'message' => 'Geçersiz işlem.']);
}
?>