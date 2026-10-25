import { isAbsolute } from 'node:path'

// Native test tools receive a minimal process environment, never saved connection
// services, credentials, preload hooks or a hosted database URL from the caller.
export function isolatedPgEnvironment(source, directory) {
  if (!isAbsolute(directory)) throw new Error('Native test tools require an absolute local socket directory.')
  const env = {}
  for (const key of ['PATH', 'LD_LIBRARY_PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'SYSTEMROOT']) {
    if (typeof source[key] === 'string') env[key] = source[key]
  }
  return {
    ...env,
    PGHOST: directory, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: 'postgres',
    PGPASSWORD: '', PGPASSFILE: '/dev/null', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10',
  }
}
