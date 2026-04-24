import type { TenantRadiusStatus } from '@captive-portal/shared'

/**
 * Badge de status do listener RADIUS. 4 estados:
 *   - tenant não-ativo (provisioning/inactive/failed): "Aguardando"
 *   - status ainda não carregado (primeiro poll): "Verificando..."
 *   - status.online=true: "Online" (accounting recebido <5min OU nunca visto)
 *   - status.online=false: "Offline" (accounting >5min atrás)
 *
 * Heurística de "online" é definida no backend — ver §9.3 da
 * docs/F5-admin-tenants.md e o endpoint GET /admin/tenants/:id/radius-status.
 */
export function RadiusOnlineBadge({
  status,
  tenantStatus,
}: {
  status: TenantRadiusStatus | null
  tenantStatus: string
}) {
  if (tenantStatus !== 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-500/20">
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
        Aguardando
      </span>
    )
  }
  if (status === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-500/20">
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Verificando...
      </span>
    )
  }
  if (status.online) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-edge-cyan/10 px-2 py-0.5 text-[10px] font-medium text-edge-cyan border border-edge-cyan/20"
        title={
          status.last_accounting_at
            ? `Último accounting: ${new Date(status.last_accounting_at).toLocaleString('pt-BR')}`
            : 'Container ativo, nenhum accounting ainda recebido'
        }
      >
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-edge-cyan" />
        Online
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/20"
      title={
        status.last_accounting_at
          ? `Sem accounting desde ${new Date(status.last_accounting_at).toLocaleString('pt-BR')}`
          : 'Nenhum accounting recebido — verifique firewall'
      }
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-400" />
      Offline
    </span>
  )
}
