<?php
$db = new PDO('sqlite:' . __DIR__ . '/database.db');
$stmt = $db->query("PRAGMA table_info(users)");
while($col = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo $col['name'] . ' (' . $col['type'] . ")\n";
}
