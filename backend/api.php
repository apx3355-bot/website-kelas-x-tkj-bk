<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');

function resolveUploadRoot(): string {
    $env = getenv('UPLOAD_PATH');
    if (is_string($env) && trim($env) !== '') return rtrim(trim($env), DIRECTORY_SEPARATOR);
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads';
}

const UPLOAD_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;
const UPLOAD_STORAGE_ROOT = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads';

function resolveDatabasePath(): string {
    $env = getenv('DB_PATH');
    if (is_string($env) && trim($env) !== '') return trim($env);
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'database.db';
}

function resolveBackupDir(): string {
    $env = getenv('BACKUP_PATH');
    if (is_string($env) && trim($env) !== '') return trim($env);
    $dbEnv = getenv('DB_PATH');
    if (is_string($dbEnv) && trim($dbEnv) !== '') return dirname(trim($dbEnv)) . DIRECTORY_SEPARATOR . 'backups';
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups';
}

function backupUsersCount(string $file): int {
    if (!is_file($file) || filesize($file) === 0) return 0;
    try {
        $probe = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $table = $probe->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")->fetch(PDO::FETCH_ASSOC);
        if (!$table) return 0;
        $count = $probe->query('SELECT COUNT(*) AS c FROM users')->fetch(PDO::FETCH_ASSOC);
        return (int)($count['c'] ?? 0);
    } catch (Throwable $error) {
        return 0;
    }
}

function createPhpBackup(string $databasePath, string $backupDir, string $reason = 'startup'): ?string {
    try {
        if (!is_dir($backupDir) && !@mkdir($backupDir, 0775, true)) return null;
        if (!is_file($databasePath) || backupUsersCount($databasePath) <= 0) return null;
        $stamp = date('Ymd-His');
        $safe = preg_replace('/[^a-z0-9-_]+/i', '', $reason);
        $target = $backupDir . DIRECTORY_SEPARATOR . "database-{$stamp}" . ($safe !== '' ? "-{$safe}" : '') . '.db';
        if (!@copy($databasePath, $target)) return null;
        $entries = glob($backupDir . DIRECTORY_SEPARATOR . '*.db') ?: [];
        usort($entries, fn($a, $b) => filemtime($b) <=> filemtime($a));
        foreach (array_slice($entries, 20) as $old) {
            @unlink($old);
        }
        return $target;
    } catch (Throwable $error) {
        return null;
    }
}

function restorePhpDatabaseIfNeeded(string $databasePath, string $backupDir): void {
    if (backupUsersCount($databasePath) > 0) return;
    $candidates = glob($backupDir . DIRECTORY_SEPARATOR . '*.db') ?: [];
    // Selalu lirik juga backups/ di repo agar backup 12 anggota ikut dipakai
    // walau BACKUP_PATH menunjuk ke /data/backups.
    $repoBackupDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups';
    if (realpath($repoBackupDir) !== realpath($backupDir)) {
        $repoBackups = glob($repoBackupDir . DIRECTORY_SEPARATOR . '*.db') ?: [];
        foreach ($repoBackups as $file) $candidates[] = $file;
    }
    $rootDbs = glob(dirname(__DIR__) . DIRECTORY_SEPARATOR . '*.db') ?: [];
    foreach ($rootDbs as $file) {
        if (realpath($file) !== realpath($databasePath)) $candidates[] = $file;
    }
    $candidates = array_values(array_unique($candidates));
    usort($candidates, fn($a, $b) => filemtime($b) <=> filemtime($a));
    $best = null;
    $bestCount = 0;
    foreach ($candidates as $file) {
        $count = backupUsersCount($file);
        if ($count > $bestCount) {
            $bestCount = $count;
            $best = $file;
        }
    }
    if ($best !== null && $bestCount > 0) {
        @mkdir(dirname($databasePath), 0775, true);
        @copy($best, $databasePath);
    }
}

$databasePath = resolveDatabasePath();
$backupDirectory = resolveBackupDir();
@mkdir(dirname($databasePath), 0775, true);
@mkdir($backupDirectory, 0775, true);
restorePhpDatabaseIfNeeded($databasePath, $backupDirectory);
// Backup startup dibatasi max 1x per jam agar tiap request tidak menyalin DB.
$throttleFile = $backupDirectory . DIRECTORY_SEPARATOR . '.last-startup-backup';
$lastBackup = is_file($throttleFile) ? (int)@filemtime($throttleFile) : 0;
if (time() - $lastBackup > 3600) {
    if (createPhpBackup($databasePath, $backupDirectory, 'startup') !== null) {
        @touch($throttleFile);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$db = new PDO('sqlite:' . $databasePath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA busy_timeout = 5000');
$db->exec('PRAGMA journal_mode = WAL');
$db->exec('PRAGMA synchronous = NORMAL');
$db->exec("CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");
$db->exec("CREATE TABLE IF NOT EXISTS member_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    nama_lengkap TEXT NOT NULL,
    kelas TEXT NOT NULL DEFAULT 'X TKJ',
    jabatan TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    photo_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");
$db->exec("CREATE TABLE IF NOT EXISTS class_structure (
    position TEXT PRIMARY KEY,
    user_id INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
)");
foreach (['wali_kelas', 'ketua', 'wakil', 'sekretaris'] as $position) {
    $stmt = $db->prepare('INSERT OR IGNORE INTO class_structure (position) VALUES (?)');
    $stmt->execute([$position]);
}

$migration = $db->query("SELECT name FROM app_migrations WHERE name = 'remove-demo-accounts'")->fetch(PDO::FETCH_ASSOC);
if (!$migration) {
    $demoUsernames = ['wali_uji', 'murid_uji'];
    $placeholders = implode(',', array_fill(0, count($demoUsernames), '?'));
    $db->beginTransaction();
    $stmt = $db->prepare("DELETE FROM login_sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($demoUsernames);
    $stmt = $db->prepare("DELETE FROM class_gallery WHERE uploaded_by IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($demoUsernames);
    $stmt = $db->prepare("DELETE FROM member_profiles WHERE user_id IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($demoUsernames);
    $stmt = $db->prepare("DELETE FROM users WHERE username IN ($placeholders)");
    $stmt->execute($demoUsernames);
    $db->exec("INSERT INTO app_migrations (name) VALUES ('remove-demo-accounts')");
    $db->commit();
}

$testMigration = $db->query("SELECT name FROM app_migrations WHERE name = 'remove-test-accounts'")->fetch(PDO::FETCH_ASSOC);
if (!$testMigration) {
    $testUsernames = ['wali_uji', 'murid_uji'];
    $placeholders = implode(',', array_fill(0, count($testUsernames), '?'));
    $db->beginTransaction();
    $stmt = $db->prepare("DELETE FROM login_sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($testUsernames);
    $stmt = $db->prepare("DELETE FROM class_gallery WHERE uploaded_by IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($testUsernames);
    $stmt = $db->prepare("DELETE FROM member_profiles WHERE user_id IN (SELECT id FROM users WHERE username IN ($placeholders))");
    $stmt->execute($testUsernames);
    $stmt = $db->prepare("DELETE FROM users WHERE username IN ($placeholders)");
    $stmt->execute($testUsernames);
    $db->exec("INSERT INTO app_migrations (name) VALUES ('remove-test-accounts')");
    $db->commit();
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function user(): ?array {
    return $_SESSION['user'] ?? null;
}

function requireLogin(): array {
    $current = user();
    if (!$current) respond(['success' => false, 'message' => 'Silakan login terlebih dahulu'], 401);
    return $current;
}

function requireRole(array $roles): array {
    $current = requireLogin();
    if (!in_array($current['role'], $roles, true)) {
        respond(['success' => false, 'message' => 'Anda tidak memiliki akses'], 403);
    }
    return $current;
}

function profile(PDO $db, int $userId): ?array {
    $stmt = $db->prepare('SELECT nama_lengkap, kelas, jabatan, bio, photo_url, updated_at FROM member_profiles WHERE user_id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function ensureProfile(PDO $db, int $userId, string $name): void {
    $stmt = $db->prepare("INSERT OR IGNORE INTO member_profiles (user_id, nama_lengkap, kelas) VALUES (?, ?, 'X TKJ')");
    $stmt->execute([$userId, $name]);
}

function requestText(string $key): string {
    return trim((string)($_POST[$key] ?? ''));
}

function uploadStorageBytes(): int {
    $roots = array_values(array_unique(array_filter([
        resolveUploadRoot(),
        UPLOAD_STORAGE_ROOT,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'uploads',
    ], fn($root) => is_string($root) && $root !== '')));
    $bytes = 0;
    foreach ($roots as $root) {
        if (!is_dir($root)) continue;
        $entries = @scandir($root);
        if ($entries === false) continue;
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $root . DIRECTORY_SEPARATOR . $entry;
            if (is_file($path)) {
                $size = @filesize($path);
                if ($size !== false) $bytes += $size;
            } elseif (is_dir($path)) {
                $bytes += uploadDirectoryBytes($path);
            }
        }
    }
    return $bytes;
}

function uploadDirectoryBytes(string $directory): int {
    $bytes = 0;
    $entries = @scandir($directory);
    if ($entries === false) return 0;
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $path = $directory . DIRECTORY_SEPARATOR . $entry;
        if (is_file($path)) {
            $size = @filesize($path);
            if ($size !== false) $bytes += $size;
        } elseif (is_dir($path)) {
            $bytes += uploadDirectoryBytes($path);
        }
    }
    return $bytes;
}

function uploadImage(string $field, string $directory, string $prefix, int $maxBytes): ?string {
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) return null;
    $file = $_FILES[$field];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $message = $file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE
            ? 'Ukuran file terlalu besar. Maksimal 5 MB untuk profil dan 8 MB untuk galeri.'
            : 'File gagal diunggah. Silakan pilih file gambar lain.';
        respond(['success' => false, 'message' => $message], 400);
    }
    if (!is_uploaded_file($file['tmp_name']) || $file['size'] <= 0) {
        respond(['success' => false, 'message' => 'File upload tidak valid'], 400);
    }
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $mime = function_exists('mime_content_type') ? @mime_content_type($file['tmp_name']) : '';
    if (!$mime && class_exists('finfo')) {
        $fileInfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $fileInfo->file($file['tmp_name']);
    }
    if ($file['size'] > $maxBytes || !isset($allowed[$mime])) {
        respond(['success' => false, 'message' => 'File harus berupa JPG, PNG, atau WebP dengan ukuran yang sesuai'], 400);
    }
    if (uploadStorageBytes() + $file['size'] > UPLOAD_STORAGE_LIMIT) {
        respond(['success' => false, 'message' => 'Penyimpanan upload sudah mencapai batas 5 GB'], 507);
    }
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        respond(['success' => false, 'message' => 'Folder upload tidak dapat dibuat'], 500);
    }
    $filename = $prefix . '-' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($file['tmp_name'], $directory . DIRECTORY_SEPARATOR . $filename)) {
        respond(['success' => false, 'message' => 'File gagal disimpan'], 500);
    }
    return $filename;
}

function removePublicFile(?string $url): void {
    if (!$url) return;
    $relative = ltrim(str_replace('/', DIRECTORY_SEPARATOR, $url), DIRECTORY_SEPARATOR);
    // URL berbentuk /uploads/... -> hapus dari UPLOAD_PATH, public/uploads DAN storage/uploads
    // agar file tidak yatim di salah satu direktori (Node pakai storage, PHP pakai public, prod pakai /data).
    $relativeUploads = preg_replace('#^uploads' . preg_quote(DIRECTORY_SEPARATOR, '#') . '#', '', $relative);
    $uploadRoot = resolveUploadRoot();
    $candidates = [
        $uploadRoot . DIRECTORY_SEPARATOR . $relativeUploads,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $relative,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . $relative,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $relativeUploads,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $relativeUploads,
    ];
    foreach (array_unique($candidates) as $path) {
        if (is_file($path)) @unlink($path);
    }
}

function normalizeMembersAlias(string $route): string {
    // Frontend memanggil developer/members, backend PHP memakai admin/members.
    // Samakan keduanya agar daftar anggota tidak 404 dan terlihat "hilang".
    if ($route === 'developer/members' || str_starts_with($route, 'developer/members/')) {
        return 'admin' . substr($route, strlen('developer'));
    }
    return $route;
}

$route = normalizeMembersAlias(trim((string)($_GET['route'] ?? ''), '/'));
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($route === 'status' && $method === 'GET') {
        $db->query('SELECT 1');
        $storageUsed = uploadStorageBytes();
        respond(['success' => true, 'message' => 'Server dan database berjalan', 'database' => true, 'upload_storage' => [
            'used_bytes' => $storageUsed,
            'limit_bytes' => UPLOAD_STORAGE_LIMIT,
            'used_percent' => round(($storageUsed / UPLOAD_STORAGE_LIMIT) * 100, 2)
        ]]);
    }

    if ($route === 'me' && $method === 'GET') {
        respond(['success' => true, 'loggedIn' => user() !== null, 'user' => user()]);
    }

    if ($route === 'login' && $method === 'POST') {
        $data = body();
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');
        $role = strtolower(trim((string)($data['role'] ?? '')));
        $role = $role === 'wali' ? 'wali_kelas' : ($role === 'siswa' ? 'murid' : $role);
        $stmt = $db->prepare('SELECT id, username, password, role, nama FROM users WHERE username = ? AND role = ?');
        $stmt->execute([$username, $role]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$account || !password_verify($password, $account['password'])) {
            respond(['success' => false, 'message' => 'Username, password, atau role tidak sesuai'], 401);
        }
        $_SESSION['user'] = ['id' => (int)$account['id'], 'username' => $account['username'], 'nama' => $account['nama'], 'role' => $account['role']];
        ensureProfile($db, (int)$account['id'], $account['nama']);
        respond(['success' => true, 'message' => 'Login berhasil', 'user' => $_SESSION['user']]);
    }

    if ($route === 'logout' && $method === 'POST') {
        $_SESSION = [];
        session_destroy();
        respond(['success' => true, 'message' => 'Logout berhasil']);
    }

    if ($route === 'member-registration-status' && $method === 'GET') {
        $count = (int)$db->query("SELECT COUNT(*) FROM users WHERE role = 'murid'")->fetchColumn();
        respond(['success' => true, 'count' => $count, 'max' => 30, 'available' => $count < 30]);
    }

    if ($route === 'member-register' && $method === 'POST') {
        $data = body();
        $name = trim((string)($data['nama'] ?? ''));
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');
        $class = trim((string)($data['kelas'] ?? ''));
        $bio = trim((string)($data['bio'] ?? ''));
        $count = (int)$db->query("SELECT COUNT(*) FROM users WHERE role = 'murid'")->fetchColumn();
        if (!$name || !$username || strlen($password) < 6 || !$class) respond(['success' => false, 'message' => 'Nama, username, kelas, dan password minimal 6 karakter wajib diisi'], 400);
        if ($count >= 30) respond(['success' => false, 'message' => 'Kuota 30 anggota sudah penuh'], 403);
        try {
            $db->beginTransaction();
            $stmt = $db->prepare('INSERT INTO users (username, password, role, nama) VALUES (?, ?, \'murid\', ?)');
            $stmt->execute([$username, password_hash($password, PASSWORD_BCRYPT), $name]);
            $id = (int)$db->lastInsertId();
            $stmt = $db->prepare('INSERT INTO member_profiles (user_id, nama_lengkap, kelas, bio) VALUES (?, ?, ?, ?)');
            $stmt->execute([$id, $name, $class, $bio]);
            $db->commit();
            respond(['success' => true, 'message' => 'Pendaftaran anggota berhasil'], 201);
        } catch (PDOException $error) {
            if ($db->inTransaction()) $db->rollBack();
            respond(['success' => false, 'message' => $error->getCode() === '23000' ? 'Username sudah digunakan' : 'Pendaftaran anggota gagal'], 409);
        }
    }

    if ($route === 'members' && $method === 'GET') {
        $members = $db->query("SELECT users.id, users.nama AS account_name, users.role,
            member_profiles.nama_lengkap, member_profiles.kelas, member_profiles.jabatan,
            member_profiles.bio, member_profiles.photo_url
            FROM users LEFT JOIN member_profiles ON member_profiles.user_id = users.id
            ORDER BY CASE users.role WHEN 'developer' THEN 1 WHEN 'wali_kelas' THEN 2 ELSE 3 END,
            COALESCE(member_profiles.nama_lengkap, users.nama) ASC")->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'members' => $members]);
    }

    if ($route === 'dashboard' && $method === 'GET') {
        $current = requireLogin();
        $permissions = [
            'developer' => ['kelola pengguna', 'kelola pengumuman', 'lihat data kelas'],
            'wali_kelas' => ['kelola pengumuman', 'lihat data murid', 'lihat jadwal kelas'],
            'murid' => ['lihat pengumuman', 'lihat jadwal kelas', 'lihat profil']
        ];
        respond(['success' => true, 'user' => $current, 'permissions' => $permissions[$current['role']] ?? []]);
    }

    if ($route === 'profile' && $method === 'GET') {
        $current = requireLogin();
        respond(['success' => true, 'profile' => profile($db, (int)$current['id'])]);
    }

    if ($route === 'profile' && $method === 'PUT') {
        $current = requireLogin();
        $data = body();
        $name = trim((string)($data['nama_lengkap'] ?? ''));
        $class = trim((string)($data['kelas'] ?? ''));
        $job = trim((string)($data['jabatan'] ?? ''));
        $bio = trim((string)($data['bio'] ?? ''));
        if ($name === '' || $class === '' || mb_strlen($job) > 80) respond(['success' => false, 'message' => 'Nama dan kelas wajib diisi'], 400);
        ensureProfile($db, (int)$current['id'], $name);
        $stmt = $db->prepare('UPDATE member_profiles SET nama_lengkap = ?, kelas = ?, jabatan = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
        $stmt->execute([$name, $class, $job, $bio, $current['id']]);
        $_SESSION['user']['nama'] = $name;
        respond(['success' => true, 'message' => 'Profil berhasil disimpan', 'profile' => profile($db, (int)$current['id'])]);
    }

    if ($route === 'profile/photo' && $method === 'POST') {
        $current = requireLogin();
        $filename = uploadImage('foto', resolveUploadRoot() . DIRECTORY_SEPARATOR . 'profiles', 'profile-' . $current['id'], 5 * 1024 * 1024);
        if (!$filename) respond(['success' => false, 'message' => 'Foto wajib dipilih'], 400);
        $old = profile($db, (int)$current['id']);
        ensureProfile($db, (int)$current['id'], $current['nama']);
        $url = '/uploads/profiles/' . $filename;
        $stmt = $db->prepare("UPDATE member_profiles SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?");
        $stmt->execute([$url, $current['id']]);
        removePublicFile($old['photo_url'] ?? null);
        respond(['success' => true, 'message' => 'Foto profil berhasil disimpan', 'photo_url' => $url]);
    }

    if ($route === 'announcements' && $method === 'GET') {
        $rows = $db->query("SELECT id, title, content, image_url, expires_at, created_at FROM announcements WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'announcements' => $rows]);
    }

    if ($route === 'announcements' && $method === 'POST') {
        requireRole(['developer', 'wali_kelas']);
        $isMultipart = str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data');
        $data = $isMultipart ? $_POST : body();
        $title = trim((string)($data['title'] ?? ''));
        $content = trim((string)($data['content'] ?? ''));
        $duration = ($data['duration'] ?? '') === 'permanent' ? null : (int)($data['duration'] ?? 0);
        if (!$title || !$content || ($duration !== null && !in_array($duration, [1, 3, 7, 30], true))) respond(['success' => false, 'message' => 'Judul dan isi pengumuman wajib diisi'], 400);
        $expires = $duration === null ? null : date('Y-m-d H:i:s', time() + $duration * 86400);
        $filename = $isMultipart ? uploadImage('poster', resolveUploadRoot() . DIRECTORY_SEPARATOR . 'gallery', 'announcement', 8 * 1024 * 1024) : null;
        $imageUrl = $filename ? '/uploads/gallery/' . $filename : null;
        $stmt = $db->prepare('INSERT INTO announcements (title, content, image_url, expires_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$title, $content, $imageUrl, $expires]);
        respond(['success' => true, 'message' => 'Pengumuman berhasil ditambahkan'], 201);
    }

    if (preg_match('#^announcements/(\\d+)$#', $route, $match) && $method === 'DELETE') {
        requireRole(['developer', 'wali_kelas']);
        $stmt = $db->prepare('SELECT image_url FROM announcements WHERE id = ?');
        $stmt->execute([(int)$match[1]]);
        $announcement = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt = $db->prepare('DELETE FROM announcements WHERE id = ?');
        $stmt->execute([(int)$match[1]]);
        removePublicFile($announcement['image_url'] ?? null);
        respond(['success' => true, 'message' => 'Pengumuman berhasil dihapus']);
    }

    if ($route === 'class-content' && $method === 'GET') {
        $info = $db->query('SELECT title, content FROM class_info WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
        $schedule = $db->query('SELECT day, subjects FROM class_schedule ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'info' => $info, 'schedule' => $schedule]);
    }

    if ($route === 'class-content' && $method === 'PUT') {
        requireRole(['developer', 'wali_kelas']);
        $data = body();
        $title = trim((string)($data['title'] ?? ''));
        $content = trim((string)($data['content'] ?? ''));
        $schedule = is_array($data['schedule'] ?? null) ? $data['schedule'] : [];
        if (!$title || !$content || !$schedule) respond(['success' => false, 'message' => 'Info kelas dan jadwal wajib diisi'], 400);
        $db->beginTransaction();
        $stmt = $db->prepare('UPDATE class_info SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
        $stmt->execute([$title, $content]);
        $stmt = $db->prepare('UPDATE class_schedule SET subjects = ? WHERE day = ?');
        foreach ($schedule as $item) $stmt->execute([trim((string)($item['subjects'] ?? '')), trim((string)($item['day'] ?? ''))]);
        $db->commit();
        respond(['success' => true, 'message' => 'Info kelas dan jadwal berhasil diperbarui']);
    }

    if ($route === 'class-structure' && $method === 'GET') {
        $structure = $db->query("SELECT structure.position, structure.user_id,
            COALESCE(member_profiles.nama_lengkap, users.nama) AS nama,
            member_profiles.jabatan, member_profiles.kelas, member_profiles.photo_url
            FROM class_structure AS structure
            LEFT JOIN users ON users.id = structure.user_id
            LEFT JOIN member_profiles ON member_profiles.user_id = users.id
            ORDER BY CASE structure.position
                WHEN 'wali_kelas' THEN 1 WHEN 'ketua' THEN 2 WHEN 'wakil' THEN 3 ELSE 4 END")->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'structure' => $structure]);
    }

    if ($route === 'class-structure' && $method === 'PUT') {
        requireRole(['developer', 'wali_kelas']);
        $data = body();
        $positions = ['wali_kelas', 'ketua', 'wakil', 'sekretaris'];
        $values = [];
        foreach ($positions as $position) {
            $value = $data[$position] ?? null;
            if ($value === '' || $value === null) {
                $values[$position] = null;
                continue;
            }
            if (!filter_var($value, FILTER_VALIDATE_INT)) respond(['success' => false, 'message' => 'Anggota struktur tidak valid'], 400);
            $values[$position] = (int)$value;
        }
        if ($values['wali_kelas'] !== null) {
            $stmt = $db->prepare("SELECT id FROM users WHERE id = ? AND role = 'wali_kelas'");
            $stmt->execute([$values['wali_kelas']]);
            if (!$stmt->fetch()) respond(['success' => false, 'message' => 'Posisi wali kelas harus diisi akun wali kelas'], 400);
        }
        $studentIds = array_filter([$values['ketua'], $values['wakil'], $values['sekretaris']]);
        if ($studentIds) {
            $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
            $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE role = 'murid' AND id IN ($placeholders)");
            $stmt->execute(array_values($studentIds));
            if ((int)$stmt->fetchColumn() !== count($studentIds)) respond(['success' => false, 'message' => 'Ketua, wakil, dan sekretaris harus anggota murid'], 400);
        }
        if (count($studentIds) !== count(array_unique($studentIds))) respond(['success' => false, 'message' => 'Satu anggota tidak boleh memegang dua posisi']);
        $db->beginTransaction();
        $stmt = $db->prepare('UPDATE class_structure SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE position = ?');
        foreach ($values as $position => $userId) $stmt->execute([$userId, $position]);
        $db->commit();
        respond(['success' => true, 'message' => 'Struktur kelas berhasil disimpan']);
    }

    if ($route === 'gallery' && $method === 'GET') {
        $rows = $db->query("SELECT gallery.id, gallery.title, gallery.description, gallery.photo_url, gallery.created_at, users.nama AS uploaded_by_name FROM class_gallery AS gallery JOIN users ON users.id = gallery.uploaded_by ORDER BY gallery.created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'photos' => $rows, 'canManage' => in_array(user()['role'] ?? '', ['developer', 'wali_kelas'], true)]);
    }

    if ($route === 'gallery' && $method === 'POST') {
        $current = requireRole(['developer', 'wali_kelas']);
        $title = requestText('title');
        $description = requestText('description');
        $filename = uploadImage('foto', resolveUploadRoot() . DIRECTORY_SEPARATOR . 'gallery', 'gallery', 8 * 1024 * 1024);
        if (!$title || !$filename) respond(['success' => false, 'message' => 'Judul dan foto wajib diisi'], 400);
        $url = '/uploads/gallery/' . $filename;
        $stmt = $db->prepare('INSERT INTO class_gallery (title, description, photo_url, uploaded_by) VALUES (?, ?, ?, ?)');
        $stmt->execute([$title, $description, $url, $current['id']]);
        respond(['success' => true, 'message' => 'Foto berhasil ditambahkan']);
    }

    if (preg_match('#^gallery/(\\d+)$#', $route, $match) && $method === 'DELETE') {
        requireRole(['developer', 'wali_kelas']);
        $stmt = $db->prepare('SELECT photo_url FROM class_gallery WHERE id = ?');
        $stmt->execute([(int)$match[1]]);
        $photo = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$photo) respond(['success' => false, 'message' => 'Foto tidak ditemukan'], 404);
        $stmt = $db->prepare('DELETE FROM class_gallery WHERE id = ?');
        $stmt->execute([(int)$match[1]]);
        removePublicFile($photo['photo_url']);
        respond(['success' => true, 'message' => 'Foto berhasil dihapus']);
    }

    if ($route === 'admin/members' && $method === 'GET') {
        requireRole(['developer', 'wali_kelas']);
        $members = $db->query("SELECT users.id, users.username, users.nama, users.role,
            member_profiles.nama_lengkap, member_profiles.kelas, member_profiles.jabatan,
            member_profiles.bio, member_profiles.photo_url
            FROM users LEFT JOIN member_profiles ON member_profiles.user_id = users.id
            WHERE users.role IN ('developer', 'murid', 'wali_kelas')
            ORDER BY CASE users.role WHEN 'developer' THEN 1 WHEN 'wali_kelas' THEN 2 ELSE 3 END,
            COALESCE(member_profiles.nama_lengkap, users.nama) ASC")->fetchAll(PDO::FETCH_ASSOC);
        respond(['success' => true, 'members' => $members]);
    }

    if (preg_match('#^admin/members/(\\d+)/reset-password$#', $route, $match) && $method === 'POST') {
        requireRole(['developer']);
        $data = body();
        $password = (string)($data['password'] ?? '');
        if (strlen($password) < 6) respond(['success' => false, 'message' => 'Password baru minimal 6 karakter'], 400);
        $stmt = $db->prepare("UPDATE users SET password = ? WHERE id = ? AND role = 'murid'");
        $stmt->execute([password_hash($password, PASSWORD_BCRYPT), (int)$match[1]]);
        if (!$stmt->rowCount()) respond(['success' => false, 'message' => 'Anggota tidak ditemukan'], 404);
        respond(['success' => true, 'message' => 'Password anggota berhasil diubah']);
    }

    if (preg_match('#^admin/members/(\\d+)$#', $route, $match) && $method === 'DELETE') {
        requireRole(['developer']);
        $id = (int)$match[1];
        if ($id === (int)user()['id']) respond(['success' => false, 'message' => 'Akun yang sedang digunakan tidak dapat dihapus'], 400);
        $stmt = $db->prepare("SELECT photo_url FROM member_profiles WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role IN ('murid', 'wali_kelas'))");
        $stmt->execute([$id, $id]);
        $profileRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt = $db->prepare("DELETE FROM users WHERE id = ? AND role IN ('murid', 'wali_kelas')");
        $stmt->execute([$id]);
        if (!$stmt->rowCount()) respond(['success' => false, 'message' => 'Akun anggota tidak ditemukan'], 404);
        removePublicFile($profileRow['photo_url'] ?? null);
        respond(['success' => true, 'message' => 'Akun berhasil dihapus']);
    }

    if (preg_match('#^admin/members/(\\d+)/profile$#', $route, $match) && $method === 'PUT') {
        requireRole(['developer', 'wali_kelas']);
        $data = body();
        $memberId = (int)$match[1];
        $name = trim((string)($data['nama_lengkap'] ?? ''));
        $class = trim((string)($data['kelas'] ?? ''));
        $job = trim((string)($data['jabatan'] ?? ''));
        $bio = trim((string)($data['bio'] ?? ''));
        if ($name === '' || $class === '') respond(['success' => false, 'message' => 'Nama dan kelas wajib diisi'], 400);
        if (strlen($job) > 80) respond(['success' => false, 'message' => 'Jabatan terlalu panjang'], 400);
        $check = $db->prepare("SELECT id, nama FROM users WHERE id = ? AND role IN ('murid', 'wali_kelas')");
        $check->execute([$memberId]);
        $member = $check->fetch(PDO::FETCH_ASSOC);
        if (!$member) respond(['success' => false, 'message' => 'Akun anggota tidak ditemukan'], 404);
        ensureProfile($db, $memberId, $name);
        $stmt = $db->prepare('UPDATE member_profiles SET nama_lengkap = ?, kelas = ?, jabatan = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
        $stmt->execute([$name, $class, $job, $bio, $memberId]);
        respond(['success' => true, 'message' => 'Profil anggota berhasil diperbarui']);
    }

    if (preg_match('#^admin/members/(\\d+)/profile/photo$#', $route, $match) && $method === 'POST') {
        requireRole(['developer', 'wali_kelas']);
        $memberId = (int)$match[1];
        $check = $db->prepare("SELECT users.id, member_profiles.photo_url FROM users LEFT JOIN member_profiles ON member_profiles.user_id = users.id WHERE users.id = ? AND users.role IN ('murid', 'wali_kelas')");
        $check->execute([$memberId]);
        $member = $check->fetch(PDO::FETCH_ASSOC);
        if (!$member) respond(['success' => false, 'message' => 'Akun anggota tidak ditemukan'], 404);
        $filename = uploadImage('foto', resolveUploadRoot() . DIRECTORY_SEPARATOR . 'profiles', 'profile-' . $memberId, 5 * 1024 * 1024);
        if (!$filename) respond(['success' => false, 'message' => 'Foto wajib dipilih'], 400);
        $url = '/uploads/profiles/' . $filename;
        $stmt = $db->prepare('UPDATE member_profiles SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
        $stmt->execute([$url, $memberId]);
        removePublicFile($member['photo_url'] ?? null);
        respond(['success' => true, 'message' => 'Foto profil anggota berhasil disimpan', 'photo_url' => $url]);
    }

    respond(['success' => false, 'message' => 'Route tidak ditemukan'], 404);
} catch (Throwable $error) {
    error_log($error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    error_log($error->getTraceAsString());
    $devMode = getenv('APP_ENV') !== 'production';
    respond([
        'success' => false,
        'message' => 'Terjadi kesalahan pada server',
        'error' => $devMode ? $error->getMessage() : null,
        'trace' => $devMode ? $error->getTraceAsString() : null
    ], 500);
}
