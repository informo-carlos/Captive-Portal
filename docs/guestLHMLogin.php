<?php
/* ========================================================
   HMAC settings, please keep the same as firewall settings
===========================================================*/
$HMAC_ALGO   = "sha256";
$HMAC_KEY    = "password";
/* ========================================================
   this sample codes use the LDAP on Windows Server
===========================================================*/
$LDAP_SERVER = "ldap://10.103.12.254";
$LDAP_DOMAIN = "wireless.dev.local";

/* session lifetime, idle timeout, RX, TX, etc settings */
$sessTimer = "7200";
$idleTimer = "300";
$maxRx = "0";
$maxTx = "0";
$quotaCycleType = "0";
$cycleSessionLifeTime = "7200";
$cycleMaxRx = "0";
$cycleMaxTx = "0";

$error = "";
$debug = [];

/* ==============================
   parse Query
================================*/
$ssid = $_GET['ssid'] ?? '';
$sessionId = $_GET['sessionId'] ?? '';
$ip = $_GET['ip'] ?? '';
$mac = $_GET['mac'] ?? '';
$ufi = $_GET['ufi'] ?? '';
$mgmtBaseUrl = $_GET['mgmtBaseUrl'] ?? '';
$clientRedirectUrl = $_GET['clientRedirectUrl'] ?? '';
$req = $_GET['req'] ?? '';
$recvHmac = $_GET['hmac'] ?? '';

if ($recvHmac) {
    $recvHmac = preg_replace('/\?.*/', '', $recvHmac);
}

/* ==============================
   HMAC validation (phase1)
================================*/
if ($recvHmac) {

    $reqEncoded = $req;
    $reqEncoded = str_replace("%", "%25", $reqEncoded);
    $reqEncoded = str_replace(":", "%3A", $reqEncoded);
    $reqEncoded = str_replace(" ", "%20", $reqEncoded);
    $reqEncoded = str_replace("?", "%3F", $reqEncoded);
    $reqEncoded = str_replace("+", "%2B", $reqEncoded);
    $reqEncoded = str_replace("&", "%26", $reqEncoded);
    $reqEncoded = str_replace("=", "%3D", $reqEncoded);

    $hmacText =
        $ssid .
        $sessionId .
        $ip .
        $mac .
        $ufi .
        $mgmtBaseUrl .
        $clientRedirectUrl .
        $reqEncoded;

    $calcHmac = hash_hmac($HMAC_ALGO, $hmacText, $HMAC_KEY);

    $debug['phase1_text'] = $hmacText;
    $debug['phase1_calc'] = $calcHmac;
    $debug['phase1_recv'] = $recvHmac;

    if (strtolower($calcHmac) != strtolower($recvHmac)) {
        $error = "HMAC validation failed";
    }
}

/* ==============================
   Login handle
================================*/
if ($_SERVER['REQUEST_METHOD'] == 'POST' && !$error) {

    $username = $_POST['username'];
    $password = $_POST['password'];

    /* ==============================
       LDAP authentication
    =================================*/
    $debug['ldap'] = [];
    $debug['ldap']['server'] = $LDAP_SERVER;

    $ldap = ldap_connect($LDAP_SERVER);

    if ($ldap === false) {

        $debug['ldap']['connect'] = "FAILED";
        $error = "LDAP initialization failed";

    } else {

        $debug['ldap']['connect'] = "SUCCESS";

        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, 5);

        $debug['ldap']['protocol'] = 3;
        $debug['ldap']['timeout'] = "5s";

        $ldapUser = $username . "@" . $LDAP_DOMAIN;
        $debug['ldap']['bind_dn'] = $ldapUser;

        $bind = @ldap_bind($ldap, $ldapUser, $password);

        $debug['ldap']['bind_result'] = $bind ? "SUCCESS" : "FAILED";
        $debug['ldap']['errno'] = ldap_errno($ldap);
        $debug['ldap']['error'] = ldap_error($ldap);

        if (!$bind) {

            $error = "Invalid username or password";

        } else {

            $debug['ldap']['auth'] = "SUCCESS";

            /* ==============================
               calculate LHM HMAC (phase2)
            =================================*/
            $lhmHmac = "";

            if ($recvHmac) {

                $text =
                    $sessionId .
                    urlencode($username) .
                    $sessTimer .
                    $idleTimer .
                    $maxRx .
                    $maxTx .
                    $quotaCycleType .
                    $cycleSessionLifeTime .
                    $cycleMaxRx .
                    $cycleMaxTx;

                $lhmHmac = hash_hmac($HMAC_ALGO, $text, $HMAC_KEY);

                $debug['phase2_text'] = $text;
                $debug['phase2_calc'] = $lhmHmac;
            }

            /* ==============================
               POST to firewall
            =================================*/
            $postUrl = rtrim($mgmtBaseUrl, "/") . "/lhmapi/externalAAAGuest";

            $body = [
                "info" => [
                    "action" => 1,
                    "sessId" => $sessionId,
                    "userName" => $username,
                    "sessionLifetime" => $sessTimer,
                    "idleTimeout" => $idleTimer,
                    "maxRx" => $maxRx,
                    "maxTx" => $maxTx,
                    "quotaCycleType" => $quotaCycleType,
                    "cycleSessionLifeTime" => $cycleSessionLifeTime,
                    "cycleMaxRx" => $cycleMaxRx,
                    "cycleMaxTx" => $cycleMaxTx
                ]
            ];

            if ($lhmHmac) {
                $body["info"]["hmac"] = $lhmHmac;
            }

            $json = json_encode($body, JSON_PRETTY_PRINT);

            $debug['post_url'] = $postUrl;
            $debug['post_json'] = $json;

            $ch = curl_init($postUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

            $response = curl_exec($ch);
            $debug['firewall_response'] = $response;

            if (curl_errno($ch)) {

                $error = curl_error($ch);

            } else {

                $resp = json_decode($response, true);

                if (isset($resp["code"]) && $resp["code"] == "50") {

                    header("Location: " . $req);
                    exit;

                } else {

                    $error = "Login failed : " . ($resp["message"] ?? "unknown");
                }
            }
        }
    }
}
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Guest Portal Login</title>

<style>
body{font-family:Arial;background:#f4f6f9;}
.box{width:420px;margin:80px auto;padding:25px;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
input{width:100%;padding:10px;margin-top:12px;border:1px solid #ccc;border-radius:5px;}
button{width:100%;padding:12px;margin-top:18px;background:#0078d7;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;}
button:hover{background:#005fa3;}
.error{color:red;margin-top:10px;}
.debug{margin:30px auto;width:90%;background:#111;color:#0f0;padding:15px;font-family:monospace;white-space:pre-wrap;}
</style>
</head>

<body>

<div class="box">
<h3>Guest Portal Login</h3>

<form method="post">
<input name="username" placeholder="Username" required>
<input type="password" name="password" placeholder="Password" required>
<button type="submit">Login</button>
</form>

<div class="error"><?php echo htmlspecialchars($error); ?></div>
</div>

<?php if (!empty($debug)): ?>
<div class="debug">

===== PHASE1 TEXT =====
<?php echo htmlspecialchars($debug['phase1_text'] ?? ''); ?>


===== PHASE1 CALC =====
<?php echo $debug['phase1_calc'] ?? ''; ?>


===== PHASE1 RECV =====
<?php echo $debug['phase1_recv'] ?? ''; ?>


===== LDAP DEBUG =====
<?php print_r($debug['ldap'] ?? []); ?>


===== PHASE2 TEXT =====
<?php echo htmlspecialchars($debug['phase2_text'] ?? ''); ?>


===== PHASE2 CALC =====
<?php echo $debug['phase2_calc'] ?? ''; ?>


===== POST URL =====
<?php echo $debug['post_url'] ?? ''; ?>


===== POST JSON =====
<?php echo htmlspecialchars($debug['post_json'] ?? ''); ?>


===== FIREWALL RESPONSE =====
<?php echo htmlspecialchars($debug['firewall_response'] ?? ''); ?>

</div>
<?php endif; ?>

</body>
</html>