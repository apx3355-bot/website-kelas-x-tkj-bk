<?php
$db = new PDO('sqlite:' . __DIR__ . '/database.db');
$stmt = $db->query("SELECT id, username, role FROM users WHERE role IN ('developer', 'wali_kelas') LIMIT 5");
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo json_encode($row) . "\n";
}
