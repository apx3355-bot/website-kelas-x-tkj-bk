<?php
$hash = '$2y$12$EmgkREFVYTjSOjaa1vUYKeWjdtnU3aBXrM9A7F6nO2hmklh8Lkfhy';
$passwords = ['dev123', 'developer', 'admin123', '123456'];
foreach ($passwords as $pass) {
    $match = password_verify($pass, $hash) ? 'MATCH' : 'no';
    echo "$pass: $match\n";
}
