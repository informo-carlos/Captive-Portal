'use client'

import { RequireRole } from '../../../components/require-role'

export default function UsersPage() {
  return (
    <RequireRole minRole="superadmin">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuarios Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestao de usuarios do painel — F6 vai implementar CRUD.
        </p>
      </div>
    </RequireRole>
  )
}
