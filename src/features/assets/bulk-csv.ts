import type { Post } from '../../types'
function cell(value: string): string {
  // Formula-leading cells stay text when a CSV is opened in a spreadsheet.
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
export function canvaBulkCsv(posts: readonly Post[]): string {
  const rows = posts.slice(0, 100).map(post => [post.idea, post.caption, post.hashtags.map(tag => `#${tag}`).join(' '), post.language ?? 'en', post.platform].map(value => cell(value.slice(0, 10000))).join(','))
  return '\ufeff' + ['idea,caption,hashtags,language,platform', ...rows].join('\r\n') + '\r\n'
}
