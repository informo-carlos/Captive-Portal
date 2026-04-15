<?php

/* ==========================================================================
   10.103.13.209:4043 can be got from the redirect url query "mgmtBaseUrl".
   https://10.103.12.93/guestLHMLogin.php?ssid=570w_733&
   sessionId=634b1d217c921a6a6bb98293798441df&ip=172.16.31.233&
   mac=80:c0:1e:52:cb:aa&ufi=2CB8ED4AC4DC&
   mgmtBaseUrl=https://10.103.13.209:4043/&
   clientRedirectUrl=https://172.16.31.1:443/&
   req=http%3A//2.2.2.2/&hmac=bb4d433676506c5e0c79e6b6181bafcb
=============================================================================*/
$FIREWALL_URL = "https://10.103.13.209:4043/lhmapi/externalAAAGuest";

/* =========================================================
   HMAC settings, please keep the same as firewall settings
============================================================*/
$HMAC_ALGO = "sha256";
$HMAC_KEY  = "password";

$response = "";
$error = "";
$debug = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $sessId  = $_POST['sessId'] ?? '';
    $eventId = $_POST['eventId'] ?? '';

    if (!$sessId || !$eventId) {
        $error = "sessId and eventId are required";
    } else {

        /* ==============================
           HMAC calculate
           Hmac_Cal(sessionId & eventId )
        =================================*/
        $hmacText = $sessId . $eventId;
        $hmac = hash_hmac($HMAC_ALGO, $hmacText, $HMAC_KEY);

        $debug['hmac_text'] = $hmacText;
        $debug['hmac_calc'] = $hmac;

        /* ==============================
           Post body
        =================================*/
        $body = [
            "info" => [
                "action"  => 2,
                "sessId"  => $sessId,
                "eventId" => $eventId,
                "hmac"    => $hmac
            ]
        ];

        $json = json_encode($body, JSON_PRETTY_PRINT);
        $debug['post_json'] = $json;

        /* ==============================
           POST
        =================================*/
        $ch = curl_init($FIREWALL_URL);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
        } else {
            $debug['response'] = $response;
        }

        curl_close($ch);
    }
}
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Guest Logout</title>

<style>
body{
    font-family:Arial;
    background:#f4f6f9;
}

.box{
    width:420px;
    margin:60px auto;
    padding:25px;
    background:white;
    border-radius:8px;
    box-shadow:0 4px 12px rgba(0,0,0,0.1);
}

input,select{
    width:100%;
    padding:10px;
    margin-top:12px;
    border:1px solid #ccc;
    border-radius:5px;
}

button{
    width:100%;
    padding:12px;
    margin-top:18px;
    background:#d9534f;
    color:white;
    border:none;
    border-radius:5px;
    font-size:16px;
    cursor:pointer;
}

button:hover{
    background:#c9302c;
}

.error{
    color:red;
    margin-top:10px;
}

.debug{
    margin:30px auto;
    width:90%;
    background:#111;
    color:#0f0;
    padding:15px;
    font-family:monospace;
    white-space:pre-wrap;
}
</style>
</head>

<body>

<div class="box">
<h3>Guest Logout</h3>

<form method="post">

<label>Session ID</label>
<input name="sessId" required>

<label>Logout Reason</label>
<select name="eventId" required>
<option value="1">1 - logout by user guest</option>
<option value="2">2 - logout by admin</option>
<option value="3">3 - logout due to session timeout</option>
<option value="4">4 - logout due to idle timeout</option>
<option value="5">5 - logout due to traffic exceeded</option>
</select>

<button type="submit">Logout</button>

</form>

<div class="error"><?php echo htmlspecialchars($error); ?></div>

</div>

<?php if (!empty($debug)): ?>
<div class="debug">

===== HMAC TEXT =====
<?php echo $debug['hmac_text'] ?? ''; ?>


===== HMAC CALCULATED =====
<?php echo $debug['hmac_calc'] ?? ''; ?>


===== POST JSON =====
<?php echo htmlspecialchars($debug['post_json'] ?? ''); ?>


===== FIREWALL RESPONSE =====
<?php echo htmlspecialchars($debug['response'] ?? ''); ?>

</div>
<?php endif; ?>

</body>
</html>