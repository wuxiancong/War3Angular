<?php
require_once 'mailer.php';
header('Content-Type: text/plain');

$mailer = new Mailer();
$to = '595292630@qq.com';
$subject = 'Test Mail ' . time();
$body = 'This is a test mail to verify SMTP configuration.';

echo "Testing mail to $to...\n";
if ($mailer->send($to, $subject, $body)) {
    echo "SUCCESS: Mail sent successfully.\n";
} else {
    echo "FAILURE: Mail sending failed. Check mail_debug.log if available.\n";
}

if (file_exists(sys_get_temp_dir() . '/mail_debug.log')) {
    echo "\n--- Debug Log (" . sys_get_temp_dir() . "/mail_debug.log) ---\n";
    echo file_get_contents(sys_get_temp_dir() . '/mail_debug.log');
} elseif (file_exists('/tmp/mail_debug.log')) {
    echo "\n--- Debug Log (" . __DIR__ . "/mail_debug.log) ---\n";
    echo file_get_contents(__DIR__ . '/mail_debug.log');
} else {
    echo "\nNo debug log found.\n";
}
