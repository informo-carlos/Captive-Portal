'use client'

import { useEffect, useRef } from 'react'

interface TermsModalProps {
  open: boolean
  onClose: () => void
  onAccept: () => void
}

export default function TermsModal({ open, onClose, onAccept }: TermsModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="animate-scale-in relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.08] bg-edge-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-lg font-bold text-white">Termos de Uso e Politica de Privacidade</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-300">
          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">1. Coleta de Dados</h3>
            <p>
              Para fornecer o acesso a rede Wi-Fi, coletamos e armazenamos os seguintes dados pessoais:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li><strong className="text-slate-300">Nome completo</strong> — informado no momento do cadastro.</li>
              <li><strong className="text-slate-300">Numero de telefone celular</strong> — utilizado para envio do codigo de verificacao (OTP) via SMS.</li>
              <li><strong className="text-slate-300">Endereço MAC do dispositivo</strong> — identificador único do seu dispositivo na rede.</li>
              <li><strong className="text-slate-300">Endereço IP</strong> — atribuido ao seu dispositivo durante a conexão.</li>
              <li><strong className="text-slate-300">Data e horario de acesso</strong> — registro do momento da autenticação.</li>
            </ul>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">2. Finalidade do Tratamento</h3>
            <p>Os dados coletados sao utilizados exclusivamente para:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>Autenticação e liberacao do acesso a rede Wi-Fi.</li>
              <li>Cumprimento de obrigações legais previstas no <strong className="text-slate-300">Marco Civil da Internet (Lei 12.965/2014)</strong>, que exige a guarda dos registros de conexão pelo prazo mínimo de 1 (um) ano.</li>
              <li>Seguranca da rede e prevencao de uso indevido.</li>
              <li>Geracao de relatorios estatisticos anonimizados sobre o uso da rede.</li>
            </ul>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">3. Base Legal</h3>
            <p>
              O tratamento dos seus dados pessoais esta fundamentado nas seguintes bases legais da <strong className="text-slate-300">Lei Geral de Protecao de Dados (LGPD — Lei 13.709/2018)</strong>:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li><strong className="text-slate-300">Consentimento</strong> (Art. 7, I) — ao aceitar estes termos, voce autoriza o tratamento dos seus dados para as finalidades descritas.</li>
              <li><strong className="text-slate-300">Cumprimento de obrigacao legal</strong> (Art. 7, II) — guarda de registros de conexão conforme o Marco Civil da Internet.</li>
              <li><strong className="text-slate-300">Interesse legitimo</strong> (Art. 7, IX) — seguranca da rede e prevencao de fraudes.</li>
            </ul>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">4. Armazenamento e Retencao</h3>
            <p>
              Os registros de conexão sao armazenados de forma segura, com criptografia, pelo periodo de <strong className="text-slate-300">5 (cinco) anos</strong>, em conformidade com as exigencias legais e politicas internas de seguranca. Apos esse periodo, os dados sao anonimizados ou excluidos.
            </p>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">5. Compartilhamento de Dados</h3>
            <p>
              Seus dados pessoais <strong className="text-slate-300">nao serao compartilhados com terceiros</strong>, exceto:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>Quando exigido por ordem judicial ou requisicao de autoridade competente.</li>
              <li>Com provedores de servico essenciais a operacao (ex.: envio de SMS), sob acordos de confidencialidade.</li>
            </ul>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-white">6. Direitos do Titular</h3>
            <p>Conforme a LGPD, voce tem direito a:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>Confirmacao da existencia de tratamento dos seus dados.</li>
              <li>Acesso aos dados pessoais coletados.</li>
              <li>Correcao de dados incompletos ou desatualizados.</li>
              <li>Anonimizacao, bloqueio ou eliminacao de dados desnecessarios.</li>
              <li>Revogacao do consentimento a qualquer momento.</li>
            </ul>
            <p className="mt-2">
              Para exercer seus direitos, entre em contato com o administrador da rede no estabelecimento.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold text-white">7. Consequencia da Recusa</h3>
            <p>
              Caso voce nao aceite estes termos, <strong className="text-slate-300">nao sera possível liberar o acesso a rede Wi-Fi</strong>, uma vez que a coleta dos dados e necessária para a autenticação e para o cumprimento das obrigações legais.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Recusar
          </button>
          <button
            onClick={onAccept}
            className="rounded-xl bg-edge-cyan px-5 py-2.5 text-sm font-bold text-edge-dark transition-all hover:shadow-lg hover:shadow-edge-cyan/20"
          >
            Li e aceito os termos
          </button>
        </div>
      </div>
    </div>
  )
}
