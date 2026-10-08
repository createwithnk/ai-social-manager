export const minimumPasswordLength = 12

export function validateNewPassword(password: string) {
  if (password.length < minimumPasswordLength || password.length > 128) {
    throw new Error('Use a password or passphrase between 12 and 128 characters.')
  }
}

export function authRedirect(flow: 'confirmed' | 'recovery', origin = window.location.origin) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Open the secure HTTPS website to continue.')
  }
  return new URL(`/?flow=${flow}`, url.origin).toString()
}

export function recoveryStorageKey(userId: string) {
  return `aasiflow-recovery-${userId}`
}

export function recoveryMarker(userId:string, expiry?:number | null) {
  try {
    const key = recoveryStorageKey(userId)
    if (expiry === null) sessionStorage.removeItem(key)
    else if (expiry !== undefined) sessionStorage.setItem(key,String(expiry))
    return Number(sessionStorage.getItem(key)) > Date.now()
  } catch { return false }
}
