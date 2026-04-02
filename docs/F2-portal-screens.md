# F2 — Portal: telas de autenticacao com mock API

> Documento tecnico explicando tudo que foi implementado na task F2.
> PR: #5 | Branch: `feat/task-f2`

---

## Indice

1. [Visao geral — o que foi criado](#1-visao-geral)
2. [Arquitetura das telas — fluxo do usuario](#2-fluxo-do-usuario)
3. [lib/mock-api.ts — Simulacao do backend](#3-mock-api)
4. [Componente PhoneInput — Mascara e validacao](#4-phoneinput)
5. [Componente OtpInput — 6 digitos com auto-focus](#5-otpinput)
6. [Componente CountdownTimer — Countdown com barra](#6-countdowntimer)
7. [Pagina / — Input de nome e celular](#7-pagina-phone)
8. [Pagina /otp — Verificacao de codigo](#8-pagina-otp)
9. [Pagina /success — Acesso liberado](#9-pagina-success)
10. [Pagina /error — Serial nao autorizado](#10-pagina-error)
11. [CSS — Animacao shake](#11-css)
12. [Decisoes tecnicas e trade-offs](#12-decisoes)
13. [Como testar](#13-como-testar)

---

## 1. Visao geral

A F2 implementou as **4 telas do portal captivo** e os **3 componentes reutilizaveis** necessarios para o fluxo de autenticacao Wi-Fi. Como o backend ainda nao existe (tasks B5/B6), todas as chamadas usam um **mock que simula respostas reais**, incluindo cenarios de erro.

### Arquivos criados

```
apps/frontend/
├── app/
│   ├── page.tsx              ← Tela 1: input de nome + celular (reescrita)
│   ├── otp/page.tsx          ← Tela 2: input de OTP + countdown
│   ├── success/page.tsx      ← Tela 3: acesso liberado
│   ├── error/page.tsx        ← Tela de erro: serial nao autorizado
│   └── globals.css           ← Adicionada animacao shake
├── components/
│   ├── PhoneInput.tsx        ← Mascara BR + validacao de DDD
│   ├── OtpInput.tsx          ← 6 campos com auto-focus
│   └── CountdownTimer.tsx    ← Timer 5:00 com barra de progresso
└── lib/
    └── mock-api.ts           ← Simula backend com validacao de serial e erros
```

### Relacao com a spec

Todas as telas seguem os contratos definidos em `docs/spec-auth-api.md`:
- Codigos de erro tratados: `unauthorized_firewall`, `invalid_phone`, `rate_limit`, `invalid_otp`, `otp_blocked`, `otp_not_found`, `sonicwall_failed`
- Formato de respostas: `{ message, expires_in }` para sucesso
- Mascara de telefone segue o padrao LGPD na tela de OTP: `(11) 9****-4321`

---

## 2. Fluxo do usuario

```
SonicWall redireciona → /?serial=MOCK-SN-001
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Tela 1: Nome +    │
                    │   Celular           │
                    │   ────────────────  │
                    │   Nome: [________]  │
                    │   Cel:  [(__)____]  │
                    │   [Receber código]  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         serial invalido   rate_limit       sucesso
              │                │                │
              ▼                ▼                ▼
         /error           mensagem        /otp?serial=...&phone=...&name=...
         (403)            inline               │
                                               ▼
                                  ┌─────────────────────┐
                                  │   Tela 2: OTP       │
                                  │   ────────────────  │
                                  │   Timer: 4:32       │
                                  │   [_][_][_][_][_][_]│
                                  │   [Verificar]       │
                                  └──────────┬──────────┘
                                             │
                    ┌────────────┬───────────┼───────────┬────────────┐
                    │            │           │           │            │
               invalid_otp  otp_blocked  otp_not_found  sonicwall   sucesso
                    │            │           │           │            │
                    ▼            ▼           ▼           ▼            ▼
               shake +      bloqueia    mostra        mensagem    /success
               tentativas   form +      "Reenviar"    de erro
               restantes    "Reenviar"
```

### Dados passados entre telas

As telas se comunicam via **query params** na URL:

| De → Para | Params passados |
|-----------|----------------|
| `/` → `/otp` | `serial`, `phone`, `name` |
| `/` → `/error` | (nenhum — redirect direto) |
| `/otp` → `/success` | `serial` |

**Por que query params e nao state global?**
- O portal captivo e acessado via redirect do SonicWall — o serial ja vem na URL
- Se o usuario der refresh na pagina de OTP, os dados sao preservados
- Nao precisa de state manager (Redux, Zustand) para 3 telas lineares
- Na F3 (integracao real), os params continuam funcionando igual

---

## 3. Mock API

**Arquivo:** `apps/frontend/lib/mock-api.ts`

### Por que existe

O backend do portal (tasks B5/B6) ainda nao esta implementado. O mock simula **exatamente** as respostas definidas na spec, incluindo todos os cenarios de erro. Isso permite:

1. Desenvolver e testar todas as telas sem depender do backend
2. Validar que o tratamento de erros esta correto
3. Facilitar a substituicao na F3 — basta trocar as chamadas mock pelas reais

### Validacao de serial

```typescript
const VALID_SERIALS = ['MOCK-SN-001', 'MOCK-SN-002']

export function isValidSerial(serial: string | null): boolean {
  if (!serial) return false
  return VALID_SERIALS.includes(serial)
}
```

Se o serial nao estiver na lista, as funcoes mock lancam `ApiRequestError` com `error: 'unauthorized_firewall'` e `code: 403` — exatamente como o backend faria via serial-guard.

### Simulacao de erros controlada

Para testar cada cenario de erro sem precisar de um backend, o mock usa **valores magicos**:

| Input | Erro simulado | Codigo |
|-------|--------------|--------|
| Telefone `11999990000` | `rate_limit` | 429 |
| OTP `123456` | **Sucesso** | 200 |
| OTP `000000` | `invalid_otp` (decrementa tentativas) | 422 |
| OTP `999999` | `otp_blocked` | 422 |
| OTP `111111` | `otp_not_found` (expirado) | 404 |
| OTP `222222` | `sonicwall_failed` | 502 |
| Qualquer outro OTP | `invalid_otp` | 422 |

### Controle de tentativas

```typescript
let mockAttemptsRemaining = 3

// No case default e '000000':
mockAttemptsRemaining = Math.max(0, mockAttemptsRemaining - 1)
throw new ApiRequestError({
  error: 'invalid_otp',
  attempts_remaining: mockAttemptsRemaining,
  ...
})
```

O mock mantem um contador de tentativas em memoria. Cada OTP errado decrementa. O `resetMockAttempts()` volta a 3 (chamado ao reenviar codigo).

### Delay simulado

```typescript
const MOCK_DELAY_MS = 800

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

Todas as funcoes mock tem 800ms de delay para simular latencia de rede. Isso permite testar os estados de loading (spinner, botao desabilitado).

---

## 4. PhoneInput

**Arquivo:** `apps/frontend/components/PhoneInput.tsx`

### O que faz

Campo de input que aplica mascara brasileira e valida o numero em tempo real.

### Mascara

A funcao `formatPhone` transforma digitos puros em formato visual:

```
""           → ""
"11"         → "(11"
"119"        → "(11) 9"
"1199999"    → "(11) 9 9999"
"11999994321" → "(11) 9 9999-4321"
```

O `extractDigits` faz o inverso — remove tudo que nao e digito e limita a 11 caracteres.

### Validacao

A funcao `validatePhone` exportada e usada tanto no componente quanto na pagina:

```typescript
export function validatePhone(digits: string): string | null {
  if (digits.length === 0) return 'Informe seu número de celular.'
  if (digits.length < 10) return 'Número incompleto.'
  if (digits.length !== 10 && digits.length !== 11)
    return 'Número de telefone inválido.'

  const ddd = parseInt(digits.slice(0, 2), 10)
  if (!VALID_DDDS.includes(ddd)) return 'DDD inválido.'

  if (digits.length === 11 && digits[2] !== '9')
    return 'Número de celular inválido.'

  return null  // null = valido
}
```

**Validacoes aplicadas:**
1. Campo obrigatorio
2. Minimo 10 digitos (fixo) ou 11 digitos (celular)
3. DDD valido — lista de todos os 67 DDDs brasileiros
4. Se 11 digitos, terceiro digito deve ser `9` (padrao de celular pos-2012)

**DDDs validos:** Inclui todos os DDDs do Brasil organizados por estado (11-19 SP, 21-24 RJ, 27-28 ES, etc).

### Comportamento de erro

O erro so aparece apos o usuario sair do campo (`onBlur`). O state `touched` controla isso:

```typescript
const [touched, setTouched] = useState(false)
const displayError = touched ? error : null
```

Isso evita mostrar "Numero incompleto" enquanto o usuario ainda esta digitando.

### Props

```typescript
interface PhoneInputProps {
  value: string         // digitos puros (ex: "11999994321")
  onChange: (digits: string) => void
  error?: string | null // erro de validacao externo
  disabled?: boolean    // durante loading
}
```

O componente e **controlado** — o pai controla o valor via props. Isso facilita validar no submit e passar o valor para a proxima pagina.

---

## 5. OtpInput

**Arquivo:** `apps/frontend/components/OtpInput.tsx`

### O que faz

6 campos de input separados para digitar o codigo OTP de 6 digitos, com navegacao automatica entre eles.

### Auto-focus

Quando o usuario digita um numero, o foco pula automaticamente para o proximo campo:

```typescript
const handleChange = useCallback((index, e) => {
  const digit = e.target.value.replace(/\D/g, '').slice(-1)
  const newValue = [...value]
  newValue[index] = digit
  onChange(newValue)

  if (digit && index < 5) {
    focusInput(index + 1)  // pula para o proximo
  }
}, [value, onChange, focusInput])
```

### Backspace inteligente

Ao pressionar Backspace em um campo vazio, o foco volta para o campo anterior e apaga o digito dele:

```typescript
if (e.key === 'Backspace') {
  if (!value[index] && index > 0) {
    // Campo vazio — volta para o anterior e apaga
    const newValue = [...value]
    newValue[index - 1] = ''
    onChange(newValue)
    focusInput(index - 1)
  } else {
    // Campo com digito — apenas apaga
    const newValue = [...value]
    newValue[index] = ''
    onChange(newValue)
  }
  e.preventDefault()
}
```

### Suporte a paste

O usuario pode colar o codigo de 6 digitos recebido por SMS. O `onPaste` no primeiro campo distribui os digitos:

```typescript
const handlePaste = useCallback((e) => {
  e.preventDefault()
  const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
  const newValue = [...value]
  for (let i = 0; i < pasted.length && i < 6; i++) {
    newValue[i] = pasted[i]
  }
  onChange(newValue)
  // Foca no proximo campo vazio ou no ultimo
  const nextEmpty = newValue.findIndex((v) => !v)
  focusInput(nextEmpty === -1 ? 5 : nextEmpty)
}, [value, onChange, focusInput])
```

### Animacao shake

A prop `shake` aplica a classe CSS `animate-shake` quando o OTP e invalido:

```typescript
<div className={`flex justify-center gap-2 sm:gap-3 ${shake ? 'animate-shake' : ''}`}>
```

### Estilo visual

- Campo vazio: borda cinza, fundo branco
- Campo preenchido: borda azul, fundo azul claro (`bg-blue-50`)
- Campo desabilitado: borda cinza claro, fundo cinza, texto apagado
- Cada campo tem `aria-label` para acessibilidade

### Props

```typescript
interface OtpInputProps {
  value: string[]       // array de 6 strings (uma por digito)
  onChange: (value: string[]) => void
  disabled?: boolean
  shake?: boolean       // dispara animacao de shake
}
```

---

## 6. CountdownTimer

**Arquivo:** `apps/frontend/components/CountdownTimer.tsx`

### O que faz

Timer regressivo de 5 minutos (300 segundos) com barra de progresso visual. Ao expirar, chama o callback `onExpire`.

### Logica do timer

```typescript
useEffect(() => {
  if (secondsLeft <= 0) {
    onExpire()
    return
  }

  const timer = setInterval(() => {
    setSecondsLeft((prev) => {
      if (prev <= 1) {
        clearInterval(timer)
        return 0
      }
      return prev - 1
    })
  }, 1000)

  return () => clearInterval(timer)
}, [secondsLeft, onExpire])
```

O `setInterval` decrementa a cada 1 segundo. Quando chega a 0, limpa o intervalo e chama `onExpire()`.

### Barra de progresso

```typescript
const progress = secondsLeft / initialSeconds  // 1.0 → 0.0

<div
  className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
  style={{ width: `${progress * 100}%` }}
/>
```

A barra encolhe linearmente de 100% a 0%. O `transition-all duration-1000 ease-linear` faz a animacao suave a cada segundo.

### Indicacao visual de urgencia

No ultimo minuto (60 segundos), a barra e o texto mudam de cor:

```typescript
const isLow = secondsLeft <= 60
const barColor = isLow ? 'bg-red-500' : 'bg-blue-500'
const textColor = isLow ? 'text-red-600' : 'text-gray-600'
```

### Reset via key

A pagina de OTP usa o `key` do React para resetar o timer ao reenviar codigo:

```tsx
const [timerKey, setTimerKey] = useState(0)

// Ao reenviar:
setTimerKey((k) => k + 1)

<CountdownTimer key={timerKey} initialSeconds={300} onExpire={handleExpire} />
```

Mudar a `key` faz o React destruir e recriar o componente, resetando o state interno para 300 segundos.

### Props

```typescript
interface CountdownTimerProps {
  initialSeconds: number  // total de segundos (300 = 5 min)
  onExpire: () => void    // callback ao chegar em 0
}
```

---

## 7. Pagina / — Input de nome e celular

**Arquivo:** `apps/frontend/app/page.tsx`

### O que faz

Primeira tela do fluxo. O usuario informa seu nome e numero de celular para receber o codigo OTP por SMS.

### Leitura do serial

```typescript
const searchParams = useSearchParams()
const serial = searchParams.get('serial') || ''
```

O serial vem na URL original do redirect do SonicWall: `/?serial=MOCK-SN-001`. E lido dos query params e passado para o mock/API em todas as chamadas.

### Campos do formulario

1. **Nome** — campo texto simples, validacao minima de 2 caracteres
2. **Telefone** — componente `PhoneInput` com mascara e validacao de DDD

### Validacao do nome

```typescript
const [nameTouched, setNameTouched] = useState(false)
const nameError = nameTouched && name.trim().length < 2 ? 'Informe seu nome.' : null
```

O erro so aparece apos o blur ou apos tentativa de submit. O botao fica desabilitado enquanto o nome tiver menos de 2 caracteres.

### Fluxo de submit

```typescript
const handleSubmit = useCallback(async (e) => {
  e.preventDefault()
  setNameTouched(true)

  if (name.trim().length < 2 || validationError) return

  setLoading(true)
  try {
    await mockRequestOtp(phone, serial)
    const params = new URLSearchParams({ serial, phone, name: name.trim() })
    router.push(`/otp?${params.toString()}`)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      if (err.error === 'unauthorized_firewall') {
        router.push('/error')     // serial invalido
        return
      }
      if (err.error === 'rate_limit') {
        setApiError(`Muitas tentativas. Aguarde ${minutes} minutos.`)
      } else {
        setApiError(err.message)
      }
    }
  } finally {
    setLoading(false)
  }
}, ...)
```

**Cenarios:**
1. **Serial invalido** → mock lanca `unauthorized_firewall` → redirect para `/error`
2. **Rate limit** → exibe mensagem com tempo de espera em minutos
3. **Sucesso** → navega para `/otp` passando serial, phone e name na URL
4. **Erro generico** → exibe mensagem do erro

### Suspense boundary

```tsx
export default function PhonePageWrapper() {
  return (
    <Suspense fallback={null}>
      <PhonePage />
    </Suspense>
  )
}
```

O Next.js 14 exige que paginas que usam `useSearchParams()` sejam envolvidas em `Suspense`. Sem isso, o build de producao (`next build`) falha com erro `missing-suspense-with-csr-bailout`. O wrapper exporta o `default` e o componente real fica como funcao interna.

### Placeholder logo

Um icone Wi-Fi SVG dentro de um circulo azul claro serve como logo provisorio. Futuramente (configuracao por tenant), sera substituido pela logo real do cliente.

---

## 8. Pagina /otp — Verificacao de codigo

**Arquivo:** `apps/frontend/app/otp/page.tsx`

### O que faz

Segunda tela do fluxo. Exibe 6 campos para digitar o OTP, um timer regressivo de 5 minutos e trata todos os cenarios de erro da spec.

### Dados recebidos

```typescript
const serial = searchParams.get('serial') || ''
const phone = searchParams.get('phone') || ''
```

### Mascara do telefone (LGPD)

O numero e exibido mascarado na tela:

```typescript
const phoneMasked = phone.length >= 10
  ? `(${phone.slice(0, 2)}) ${phone[2]}****-${phone.slice(-4)}`
  : phone
// "11987654321" → "(11) 9****-4321"
```

### Estados da pagina

```typescript
const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''))
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [shake, setShake] = useState(false)
const [expired, setExpired] = useState(false)
const [blocked, setBlocked] = useState(false)
const [resending, setResending] = useState(false)
const [timerKey, setTimerKey] = useState(0)
```

| State | Controla |
|-------|---------|
| `otpDigits` | Os 6 digitos digitados |
| `loading` | Spinner no botao "Verificar" |
| `error` | Mensagem de erro exibida |
| `shake` | Animacao de shake no OtpInput |
| `expired` | Timer zerou — mostra botao "Reenviar" |
| `blocked` | Muitas tentativas erradas — mostra "Reenviar" |
| `resending` | Loading do botao "Reenviar" |
| `timerKey` | Reset do CountdownTimer |

### Tratamento de erros do verify-otp

```typescript
switch (err.error) {
  case 'invalid_otp':
    triggerShake()  // animacao de 500ms
    setError(`Código inválido. Tentativas restantes: ${err.attempts_remaining}`)
    break

  case 'otp_blocked':
    setBlocked(true)  // desabilita inputs + mostra "Reenviar"
    setError('Muitas tentativas. Solicite um novo código.')
    break

  case 'otp_not_found':
    setExpired(true)  // mostra "Reenviar"
    setError('Código expirado. Solicite um novo código.')
    break

  case 'sonicwall_failed':
    setError('Falha ao liberar acesso. Contate o suporte.')
    break
}
```

Cada cenario de erro tem um comportamento visual distinto conforme a spec.

### Reenvio de codigo

```typescript
const handleResend = useCallback(async () => {
  setResending(true)
  await mockRequestOtp(phone, serial)
  resetMockAttempts()          // volta tentativas para 3
  setOtpDigits(Array(6).fill(''))  // limpa campos
  setExpired(false)            // reabilita timer
  setBlocked(false)            // desbloqueia
  setTimerKey((k) => k + 1)   // reseta timer (novo key = novo componente)
}, [phone, serial, router])
```

O botao "Reenviar codigo" aparece quando o timer expira ou quando o OTP e bloqueado. Ao clicar:
1. Chama o mock para simular novo envio de SMS
2. Reseta todos os estados
3. Recria o timer via mudanca de `key`

### Logica do botao principal

A pagina alterna entre dois botoes:
- **"Verificar"** — quando timer ativo e nao bloqueado
- **"Reenviar codigo"** — quando timer expirou ou OTP bloqueado

```tsx
{!expired && !blocked ? (
  <button type="submit">Verificar</button>
) : (
  <button type="button" onClick={handleResend}>Reenviar código</button>
)}
```

---

## 9. Pagina /success — Acesso liberado

**Arquivo:** `apps/frontend/app/success/page.tsx`

### O que faz

Terceira e ultima tela. Confirma que o acesso Wi-Fi foi liberado.

### Conteudo

- Icone de checkmark verde dentro de circulo
- Titulo: "Acesso liberado com sucesso!"
- Texto: "Voce ja pode navegar na internet. Pode fechar esta janela."
- Badge: "Tempo de acesso: 8 horas"

### Auto-close

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    setClosing(true)
    window.close()  // tenta fechar a janela
  }, 5000)
  return () => clearTimeout(timer)
}, [])
```

Apos 5 segundos, tenta fechar a janela do navegador. O `window.close()` so funciona se a janela foi aberta via JavaScript (popup). Em captive portals, muitos navegadores mobile abrem uma janela especial que suporta isso. Se nao fechar, o texto "Fechando automaticamente..." aparece.

---

## 10. Pagina /error — Serial nao autorizado

**Arquivo:** `apps/frontend/app/error/page.tsx`

### O que faz

Tela de erro exibida quando o serial do SonicWall nao e reconhecido (403 `unauthorized_firewall`).

### Conteudo

- Icone de alerta vermelho (triangulo com exclamacao)
- Titulo: "Dispositivo nao autorizado"
- Texto: "Este aparelho nao esta autorizado a usar este portal. Contate o administrador da rede."

### Decisao: sem detalhes tecnicos

A tela **nao exibe** o serial, o codigo de erro ou qualquer informacao tecnica. Isso e intencional:
1. O usuario final nao sabe o que e um "serial SonicWall"
2. Expor o serial poderia facilitar tentativas de spoofing
3. A mensagem direciona para o administrador, que sabe investigar

### Server component

Esta e a unica pagina que **nao usa `'use client'`** — e um server component puro. Nao precisa de state, hooks ou interatividade. O Next.js renderiza como HTML estatico.

---

## 11. CSS — Animacao shake

**Arquivo:** `apps/frontend/app/globals.css`

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
```

A animacao desloca o elemento 4px para esquerda e direita alternadamente durante 500ms. E usada no `OtpInput` quando o codigo e invalido — feedback visual imediato que algo deu errado.

**Por que CSS puro e nao Tailwind?** O Tailwind nao tem uma animacao de shake built-in. Em vez de configurar no `tailwind.config.ts`, usamos CSS direto — mais simples e evita acoplar a animacao ao Tailwind.

---

## 12. Decisoes tecnicas e trade-offs

### Query params vs state global

**Escolha:** Query params (`?serial=X&phone=Y&name=Z`)

**Motivo:** O fluxo e linear (3 telas), o serial ja vem na URL do SonicWall, e query params sobrevivem a refresh. Um state manager como Zustand seria over-engineering para 3 telas.

**Trade-off:** O telefone fica visivel na URL. Isso e aceitavel porque:
- E a propria rede Wi-Fi do usuario (nao e publico)
- O captive portal roda em HTTP local (nao indexado)
- Na F3 podemos migrar para session storage se necessario

### Mock API vs MSW (Mock Service Worker)

**Escolha:** Mock functions simples em `lib/mock-api.ts`

**Motivo:** MSW intercepta `fetch` no nivel da rede — mais realista mas mais complexo de configurar. Como a F3 vai substituir os mocks pelas chamadas reais em `lib/api.ts`, nao vale investir em infra de mock sofisticada.

**Trade-off:** Os mocks nao passam pelo `lib/api.ts` real (nao testam o fetch). Aceitavel porque a F3 vai fazer a integracao real.

### Suspense wrapper vs dynamic import

**Escolha:** Wrapper com `<Suspense fallback={null}>`

**Motivo:** O Next.js 14 exige Suspense para paginas que usam `useSearchParams()`. A alternativa seria `dynamic(() => import('./PhonePage'), { ssr: false })`, mas o wrapper e mais explicito e nao desabilita SSR completamente.

### Valor magico vs UI de teste

**Escolha:** OTPs magicos (123456 = sucesso, 000000 = erro, etc)

**Motivo:** Permite testar cada cenario sem UI extra. Uma pagina de "debug panel" seria mais user-friendly mas e codigo descartavel — na F3 os mocks somem.

---

## 13. Como testar

### Dev server

```bash
cd apps/frontend
npm run dev
```

### Testar fluxo completo (sucesso)

1. Abrir `http://localhost:3000/?serial=MOCK-SN-001`
2. Digitar nome (ex: "Carlos") e celular (ex: `11987654321`)
3. Clicar "Receber codigo" → navega para `/otp`
4. Digitar `123456` → navega para `/success`
5. Apos 5s, tenta fechar a janela

### Testar serial invalido

1. Abrir `http://localhost:3000/?serial=INVALIDO`
2. Preencher nome e celular, clicar "Receber codigo"
3. Deve redirecionar para `/error` com mensagem "Dispositivo nao autorizado"

### Testar rate limit

1. Abrir `http://localhost:3000/?serial=MOCK-SN-001`
2. Digitar nome e celular `11999990000`
3. Clicar "Receber codigo"
4. Deve exibir mensagem "Muitas tentativas. Aguarde 10 minutos."

### Testar OTP invalido (com shake)

1. Na tela de OTP, digitar `000000`
2. Clicar "Verificar"
3. Campos devem sacudir + mensagem "Tentativas restantes: 2"

### Testar OTP bloqueado

1. Na tela de OTP, digitar `999999`
2. Clicar "Verificar"
3. Campos desabilitados + botao "Reenviar codigo"

### Testar OTP expirado

1. Na tela de OTP, digitar `111111`
2. Clicar "Verificar"
3. Mensagem "Codigo expirado" + botao "Reenviar codigo"

### Testar falha SonicWall

1. Na tela de OTP, digitar `222222`
2. Clicar "Verificar"
3. Mensagem "Falha ao liberar acesso. Contate o suporte."

### Testar timer expirando

1. Na tela de OTP, aguardar 5 minutos (ou alterar `initialSeconds` para 10 em dev)
2. Timer chega a 0 → campos desabilitados + botao "Reenviar codigo"

### Testar reenvio

1. Apos timer expirar ou OTP bloqueado, clicar "Reenviar codigo"
2. Timer reseta para 5:00, campos limpos e habilitados

### Build de producao

```bash
cd apps/frontend && npm run build
# Deve compilar sem erros e gerar 4 rotas estaticas
```

---

## Proximas tasks que constroem em cima da F2

| Task | O que vai mudar |
|------|----------------|
| **F3** | Substituir `mock-api.ts` por chamadas reais a `lib/api.ts`. Deletar o mock. |
| **F4** | Nenhuma mudanca no portal — F4 e sobre o admin. |
