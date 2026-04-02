'use client'

import { RequireRole } from '../../../components/require-role'

export default function AuditPage() {
  return (
    <RequireRole minRole="superadmin">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registro de acoes administrativas — F7 vai implementar.
        </p>
      </div>
    </RequireRole>
  )
}
