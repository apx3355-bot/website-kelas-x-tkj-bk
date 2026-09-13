<?php
$db = new PDO('sqlite:' . __DIR__ . '/database.db');
$stmt = $db->query("SELECT id, username, password, role FROM users WHERE username = 'developer'");
$row = $stmt->fetch(PDO::FETCH_ASSOC);
echo json_encode($row, JSON_PRETTY_PRINT);
