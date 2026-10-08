// Prepare a pinned native test runtime installed with npm --ignore-scripts.
// Never executes dependency lifecycle scripts or changes a host account.
import assert from 'node:assert/strict'
import { readFile, readlink, symlink } from 'node:fs/promises'
import path from 'node:path'

const directory = process.argv[2]
assert.ok(directory && path.isAbsolute(directory), 'Supply an absolute temporary npm install directory.')
const packageRoot = path.join(directory, 'node_modules/@embedded-postgres/linux-x64')
const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'))
const entry = lock.packages['node_modules/@embedded-postgres/linux-x64']
assert.equal(entry.version, '17.10.0-beta.17')
assert.equal(entry.integrity, 'sha512-hU4Sgna19ixDP/l3P/zkHhQ9B0JDV39qA97RNz55QcngeRjFC5/1G36LZjODVJ84kVJHUTQMmly7nzWO8js8kg==')
assert.equal(lock.packages['node_modules/pg'].version, '8.23.1')
const links = JSON.parse(await readFile(path.join(packageRoot, 'native/pg-symlinks.json'), 'utf8'))
assert.equal(links.length, 14)
for (const { source, target } of links) {
  assert.equal(typeof source, 'string'); assert.equal(typeof target, 'string')
  const file = path.resolve(packageRoot, source), link = path.resolve(packageRoot, target)
  for (const destination of [file, link]) assert.ok(destination.startsWith(packageRoot + path.sep), 'Symlinks must stay within the test package.')
  const relative = path.relative(path.dirname(link), file)
  try { await symlink(relative, link) }
  catch (error) { if (error.code !== 'EEXIST') throw error; assert.equal(await readlink(link), relative) }
}
console.log('Prepared pinned PostgreSQL 17.10 binaries; 14 package-contained symlinks verified.')
