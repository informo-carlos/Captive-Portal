// POST cross-origin ao SonicWall (LHM 7.3+ / SonicOS >= 7.3.2).
//
// O firewall fica na LAN privada do cliente — inacessível da nossa VPS.
// O navegador do usuário, que ESTÁ na LAN, pode chegar lá.
//
// Estratégia: fetch no-cors com Content-Type text/plain carregando JSON.
//   - no-cors evita preflight (que o firewall rejeitaria sem CORS headers)
//   - text/plain é "simple Content-Type" e não dispara preflight OPTIONS
//   - body é JSON válido — o parser de /lhmapi/externalAAAGuest ignora
//     o Content-Type declarado e trata o body como JSON de qualquer forma
//     (comportamento observado na referência oficial guestLHMLogin.php que
//     usa curl sem configurar Content-Type explícito em alguns paths)
//
// Nota: com mode: 'no-cors' a resposta é opaque (não legível). O POST é
// fire-and-forget. Erros de CORS não impedem o envio do request — o firewall
// RECEBE o POST mesmo que o browser jogue um NetworkError no catch.
//
// Se isso não funcionar em campo (firewall rejeitar text/plain), a próxima
// iteração usará form-urlencoded com payload=<json_encoded>.

export async function postToFirewall(instruction: {
  url: string
  payload: Record<string, unknown>
}): Promise<void> {
  const body = JSON.stringify(instruction.payload)
  try {
    await fetch(instruction.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body,
    })
  } catch (err) {
    // No-cors sempre lança em ambientes onde CORS é bloqueado, mas o request
    // JÁ FOI enviado pelo browser. Logamos pra debug sem bloquear o fluxo.
    // eslint-disable-next-line no-console
    console.warn('lhm post error (esperado em no-cors):', err)
  }
}
