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

$error = "";
$debug = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $sessId  = trim($_POST['sessId']);
    $userName = trim($_POST['userName']);

    $sessionLifetime = $_POST['sessionLifetime'];
    $idleTimeout = $_POST['idleTimeout'];

    $maxTxMB = $_POST['maxTx'];
    $maxRxMB = $_POST['maxRx'];

    $quotaCycleType = $_POST['quotaCycleType'];
    $cycleSessionLifeTime = $_POST['cycleSessionLifeTime'];
    $cycleMaxTxMB = $_POST['cycleMaxTx'];
    $cycleMaxRxMB = $_POST['cycleMaxRx'];

    /* MB → bytes */
    $maxTx = (string)($maxTxMB);
    $maxRx = (string)($maxRxMB);
    $cycleMaxTx = (string)($cycleMaxTxMB);
    $cycleMaxRx = (string)($cycleMaxRxMB);

    /* ==============================
       HMAC calculate
    =================================*/
    if ($sessId) {
        $hmacText =
            $sessId .
            $userName .
            $sessionLifetime .
            $idleTimeout .
            $maxRx .
            $maxTx;
    } else {
        $hmacText =
            $userName .
            $sessionLifetime .
            $idleTimeout .
            $maxRx .
            $maxTx;
    }

    $hmac = hash_hmac($HMAC_ALGO, $hmacText, $HMAC_KEY);

    $debug['hmac_text'] = $hmacText;
    $debug['hmac_calc'] = $hmac;

    /* ==============================
       Post body
    =================================*/
    $info = [
        "action" => 4,
        "userName" => $userName,
        "sessionLifetime" => $sessionLifetime,
        "idleTimeout" => $idleTimeout,
        "maxTx" => $maxTx,
        "maxRx" => $maxRx
    ];

    if ($sessId !== "") {
        $info["sessId"] = $sessId;
    }

    if ($quotaCycleType !== "") {
        $info["quotaCycleType"] = $quotaCycleType;
    }

    if ($cycleSessionLifeTime !== "") {
        $info["cycleSessionLifeTime"] = $cycleSessionLifeTime;
    }

    if ($cycleMaxTxMB !== "") {
        $info["cycleMaxTx"] = $cycleMaxTx;
    }

    if ($cycleMaxRxMB !== "") {
        $info["cycleMaxRx"] = $cycleMaxRx;
    }

    $info["hmac"] = $hmac;

    $body = ["info" => $info];

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
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Update Session</title>

<style>
body{font-family:Arial;background:#f4f6f9;}
.box{width:520px;margin:40px auto;padding:25px;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
input,select{width:100%;padding:10px;margin-top:10px;border:1px solid #ccc;border-radius:5px;}
button{width:100%;padding:12px;margin-top:20px;background:#0078d7;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;}
button:hover{background:#005fa3;}
label{font-weight:bold;margin-top:12px;display:block;}
.unit{color:#666;font-size:12px;}
.debug{margin:30px auto;width:90%;background:#111;color:#0f0;padding:15px;font-family:monospace;white-space:pre-wrap;}
.error{color:red;margin-top:10px;}
</style>
</head>

<body>

<div class="box">
<h3>Update Session</h3>

<form method="post">

<label>Session ID (optional)</label>
<input name="sessId">

<label>User Name</label>
<input name="userName" required>

<label>Session Lifetime <span class="unit">(seconds)</span></label>
<input name="sessionLifetime" required>

<label>Idle Timeout <span class="unit">(seconds)</span></label>
<input name="idleTimeout" required>

<label>Max TX <span class="unit">(MB)</span></label>
<input name="maxTx" required>

<label>Max RX <span class="unit">(MB)</span></label>
<input name="maxRx" required>

<label>Quota Cycle Type</label>
<select name="quotaCycleType">
<option value="">-- optional --</option>
<option value="0">0 - nonQuota</option>
<option value="1">1 - Per day</option>
<option value="2">2 - Per week</option>
<option value="3">3 - Per month</option>
</select>

<label>Cycle Session Lifetime <span class="unit">(seconds)</span></label>
<input name="cycleSessionLifeTime">

<label>Cycle Max TX <span class="unit">(MB)</span></label>
<input name="cycleMaxTx">

<label>Cycle Max RX <span class="unit">(MB)</span></label>
<input name="cycleMaxRx">

<button type="submit">Update Session</button>

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