// Extrai e serializa os query params LHM do redirect inicial do SonicWall.
//
// O SonicWall (em modo External Guest Authentication) injeta vários params
// no redirect inicial — sessionId, mac, ip, magic, mgmtBaseUrl, etc — e os
// nomes/quantidade variam por firmware. Em vez de listar todos, capturamos
// QUALQUER param que não seja conhecido como interno do nosso fluxo.
//
// Esses params são propagados via URL entre as páginas internas do portal e
// enviados no body de POST /auth/request-otp pro backend, que os guarda no
// Redis pra usar de volta no verify-otp (LHM redirect).

/**
 * Params que o NOSSO portal usa internamente — não devem ser tratados como
 * params LHM do SonicWall.
 */
const INTERNAL_PARAMS = new Set(['serial', 'mac', 'ip', 'phone', 'name', 'lhm'])

/**
 * Lê do URLSearchParams todos os pares chave-valor que não são internos.
 */
export function extractLhmParams(
  searchParams: URLSearchParams | { get: (k: string) => string | null; entries?: () => IterableIterator<[string, string]> },
): Record<string, string> {
  const out: Record<string, string> = {}

  // ReadonlyURLSearchParams (Next.js) tem entries() — usamos quando disponível
  const entries =
    typeof (searchParams as URLSearchParams).entries === 'function'
      ? Array.from((searchParams as URLSearchParams).entries())
      : []

  for (const [key, value] of entries) {
    if (INTERNAL_PARAMS.has(key)) continue
    if (!value) continue
    out[key] = value
  }
  return out
}

/**
 * Serializa o objeto LHM como uma string única pra repassar via URL entre
 * páginas internas (preserva a forma exata pro request-otp depois).
 * Formato: JSON URI-encoded — simples e à prova de chars problemáticos.
 */
export function serializeLhmParams(params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return ''
  return encodeURIComponent(JSON.stringify(params))
}

/**
 * Valida que uma URL recebida do backend pra redirect LHM é segura.
 *
 * Regras:
 *  - Precisa ser parseável como URL absoluta
 *  - Protocolo http(s) apenas
 *  - Path precisa terminar em `externalGuestLogin.cgi` (endpoint oficial do
 *    SonicWall pro retorno LHM) — protege contra phishing/open redirect
 *  - Limite de tamanho razoável
 */
export function isValidLhmRedirectUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string' || raw.length > 2048) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (!url.hostname) return false
  if (!url.pathname.endsWith('/externalGuestLogin.cgi')) return false
  return true
}

/**
 * Inverso de serializeLhmParams. Retorna {} se a string for vazia ou inválida.
 */
export function deserializeLhmParams(serialized: string): Record<string, string> {
  if (!serialized) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(serialized))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // ignora — retorna vazio
  }
  return {}
}
