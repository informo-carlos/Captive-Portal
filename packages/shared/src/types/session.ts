export interface WifiSession {
  id: string
  tenant: {
    id: string
    name: string
  }
  phone_masked: string
  mac_address: string
  ip_address: string
  auth_at: string
  expires_at: string
}
