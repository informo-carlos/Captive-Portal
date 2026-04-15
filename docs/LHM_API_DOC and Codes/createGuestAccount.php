<?php
$error = "";
$responseText = "";

/* =========================================================
   HMAC settings, please keep the same as firewall settings
============================================================*/
$hmacEnable = true;
$HMAC_ALGO = "sha256";
$HMAC_KEY  = "password";

function post_val($name, $default) {
    return (isset($_POST[$name]) && $_POST[$name] !== "")
        ? trim($_POST[$name])
        : $default;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {

    /* 10.103.13.209:4043 can be got from the redirect url query "mgmtBaseUrl".
	   https://10.103.12.93/guestLHMLogin.php?ssid=570w_733&
	   sessionId=634b1d217c921a6a6bb98293798441df&ip=172.16.31.233&
	   mac=80:c0:1e:52:cb:aa&ufi=2CB8ED4AC4DC&
	   mgmtBaseUrl=https://10.103.13.209:4043/&
	   clientRedirectUrl=https://172.16.31.1:443/&
	   req=http%3A//2.2.2.2/&hmac=bb4d433676506c5e0c79e6b6181bafcb
	*/
	$url = "https://10.103.13.209:4043/lhmapi/externalAAAGuest";

    $info = [
        "action" => 3,
        "userName" => post_val("userName", ""),
        "passwd" => post_val("passwd", ""),
        "comment" => post_val("comment", ""),
        "accountLifetime" => post_val("acctLifetime", "604800"),
        "sessionLifetime" => post_val("sessLifetime", "7200"),
        "idleTimeout" => post_val("idleTimeout", "60"),
        "uniqueLogin" => post_val("uniqueLogin", "0"),
        "activateNow" => post_val("activateNow", "0"),
        "autoPrune" => post_val("autoPrune", "0"),
        "maxRx" => post_val("maxRx", "0"),
        "maxTx" => post_val("maxTx", "0"),
        "quotaCycleType" => post_val("quotaCycleType", "0"),
        "cycleSessionLifeTime" => post_val("cycleSessionLifetime", "7200"),
        "cycleMaxRx" => post_val("cycleMaxRx", "0"),
        "cycleMaxTx" => post_val("cycleMaxTx", "0")
    ];

    if ($hmacEnable) {

        $hmacText =
            $info["userName"] .
            $info["passwd"] .
            $info["comment"] .
            $info["accountLifetime"] .
            $info["sessionLifetime"] .
            $info["idleTimeout"] .
            $info["uniqueLogin"] .
            $info["activateNow"] .
            $info["autoPrune"] .
            $info["maxRx"] .
            $info["maxTx"] .
            $info["quotaCycleType"] .
            $info["cycleSessionLifeTime"] .
            $info["cycleMaxRx"] .
            $info["cycleMaxTx"];

        $hmac = hash_hmac($HMAC_ALGO, $hmacText, $HMAC_KEY);
        $info["hmac"] = $hmac;

        $debugHmacText = $hmacText;
        $debugHmac = $hmac;
    }

    $data = ["info" => $info];
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        $error = curl_error($ch);
    } else {
        $responseText = $response;
    }
}
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Create User</title>

<style>
body { font-family: Arial; background: #f5f7fa; }
.container { width: 780px; margin: 30px auto; }
.card { background: white; border-radius: 10px; padding: 20px; margin-bottom: 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); }
h2 { text-align: center; }
.section-title { font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom:4px;}
.grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px;}
label { font-size:13px; font-weight:bold; }
input, select {
    width:100%;
    padding:7px;
    border-radius:6px;
    border:1px solid #ccc;
}
button {
    width:100%;
    padding:12px;
    background:#4CAF50;
    color:white;
    border:none;
    border-radius:8px;
    font-size:16px;
}
.preview {
    background:#111;
    color:#00ff9c;
    padding:10px;
    border-radius:6px;
    font-size:12px;
    white-space:pre-wrap;
}
.switch { position: relative; display:inline-block; width:46px; height:24px;}
.switch input {display:none;}
.slider { position:absolute; background:#ccc; border-radius:24px; top:0;left:0;right:0;bottom:0;}
.slider:before {
    content:"";
    position:absolute;
    height:18px;width:18px;
    left:3px;bottom:3px;
    background:white;
    border-radius:50%;
    transition:.3s;
}
input:checked + .slider { background:#4CAF50;}
input:checked + .slider:before { transform:translateX(22px);}
.row { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;}
</style>

<script>
function toggle(id, checkbox) {
    document.getElementById(id).value = checkbox.checked ? "1" : "0";
    updatePreview();
}

function getVal(name, def="") {
    const v = document.querySelector(`[name="${name}"]`).value;
    return v === "" ? def : v;
}

function updatePreview() {
    const data = {
        info: {
            action: 3,
            userName: getVal("userName"),
            passwd: getVal("passwd"),
            comment: getVal("comment"),
            accountLifetime: getVal("acctLifetime","604800"),
            sessionLifetime: getVal("sessLifetime","0"),
            idleTimeout: getVal("idleTimeout","60"),
            uniqueLogin: getVal("uniqueLogin","0"),
            activateNow: getVal("activateNow","0"),
            autoPrune: getVal("autoPrune","0"),
            maxRx: getVal("maxRx","0"),
            maxTx: getVal("maxTx","0"),
            quotaCycleType: getVal("quotaCycleType","0"),
            cycleSessionLifeTime: getVal("cycleSessionLifetime","0"),
            cycleMaxRx: getVal("cycleMaxRx","0"),
            cycleMaxTx: getVal("cycleMaxTx","0")
        }
    };
    document.getElementById("preview").textContent =
        JSON.stringify(data,null,2);
}

window.onload=function(){
document.querySelectorAll("input,select").forEach(el=>{
    el.addEventListener("input",updatePreview);
    el.addEventListener("change",updatePreview);
});
updatePreview();
};
</script>

</head>

<body>
<div class="container">

<h2>Create User Account</h2>

<form method="POST">

<div class="card">
<div class="section-title">JSON Preview</div>
<div id="preview" class="preview"></div>
</div>

<?php if (!empty($debugHmacText)): ?>
<div class="card">
<div class="section-title">HMAC Debug</div>
<div class="preview">
HMAC STRING:
<?php echo htmlspecialchars($debugHmacText); ?>


HMAC VALUE:
<?php echo htmlspecialchars($debugHmac); ?>
</div>
</div>
<?php endif; ?>

<div class="card">
<div class="section-title">Basic Info</div>
<div class="grid">
<div>
<label>Username</label>
<input name="userName">
</div>
<div>
<label>Password</label>
<input type="password" name="passwd">
</div>
<div style="grid-column:1/3">
<label>Comment</label>
<input name="comment">
</div>
</div>
</div>

<div class="card">
<div class="section-title">Session (seconds)</div>
<div class="grid">
<div>
<label>Account Lifetime</label>
<input name="acctLifetime" value="604800">
</div>
<div>
<label>Session Lifetime</label>
<input name="sessLifetime" value="0">
</div>
<div>
<label>Idle Timeout</label>
<input name="idleTimeout" value="60">
</div>
</div>
</div>

<div class="card">
<div class="section-title">Options</div>

<div class="row">
<label>Unique Login</label>
<label class="switch">
<input type="checkbox" onchange="toggle('uniqueLogin', this)">
<span class="slider"></span>
</label>
<input type="hidden" name="uniqueLogin" id="uniqueLogin" value="0">
</div>

<div class="row">
<label>Activate Now</label>
<label class="switch">
<input type="checkbox" onchange="toggle('activateNow', this)">
<span class="slider"></span>
</label>
<input type="hidden" name="activateNow" id="activateNow" value="0">
</div>

<div class="row">
<label>Auto Prune</label>
<label class="switch">
<input type="checkbox" onchange="toggle('autoPrune', this)">
<span class="slider"></span>
</label>
<input type="hidden" name="autoPrune" id="autoPrune" value="0">
</div>

</div>

<div class="card">
<div class="section-title">Traffic (bytes)</div>
<div class="grid">
<div>
<label>Max RX</label>
<input name="maxRx" value="0">
</div>
<div>
<label>Max TX</label>
<input name="maxTx" value="0">
</div>
</div>
</div>

<div class="card">
<div class="section-title">Quota Cycle</div>
<div class="grid">
<div>
<label>Cycle Type</label>
<select name="quotaCycleType">
<option value="0">Non Cyclic</option>
<option value="1">Per Day</option>
<option value="2">Per Week</option>
<option value="3">Per Month</option>
</select>
</div>

<div>
<label>Cycle Session Lifetime</label>
<input name="cycleSessionLifetime" value="0">
</div>

<div>
<label>Cycle Max RX</label>
<input name="cycleMaxRx" value="0">
</div>

<div>
<label>Cycle Max TX</label>
<input name="cycleMaxTx" value="0">
</div>
</div>
</div>

<button type="submit">Create Account</button>

</form>

<?php if ($responseText): ?>
<div class="card preview"><?php echo htmlspecialchars($responseText); ?></div>
<?php endif; ?>

</div>
</body>
</html>