<?php
$db = new PDO('sqlite:' . __DIR__ . '/database.db');
$newPass = password_hash('dev123', PASSWORD_BCRYPT);
$stmt = $db->prepare("UPDATE users SET password = ? WHERE username = 'developer'");
$stmt->execute([$newPass]);
echo "Password updated for developer. New hash: $newPass\n";
