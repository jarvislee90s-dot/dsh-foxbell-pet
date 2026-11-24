// Host-owned authorization adapter. DSH profiles without a real capability return null,
// so additive dashboard routes are not registered. Request identity is never inspected here.
export function hostOwnerVerifier(connection) {
  // dsh-v0.2.2-rc.5 public Connection service: verifies Host/Origin and the signed
  // browser/API credential, then returns the host-created Peer (not a request field).
  if (connection && typeof connection.admit === 'function') {
    return async (req) => {
      try {
        const admission = await connection.admit(req)
        return !!admission && typeof admission === 'object' && 'peer' in admission
          && admission.peer && admission.peer.principal && admission.peer.principal.kind === 'owner'
      } catch { return false }
    }
  }
  return null
}
