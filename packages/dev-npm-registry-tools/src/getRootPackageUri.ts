import { existsSync } from 'fs'
import { resolve } from 'path'

export function getRootPackageUri(startDir: string): string | null {
  const parent = resolve(startDir, '..')
  if (!existsSync(parent)) return null
  const pkgJsonUri = resolve(parent, 'package.json')
  if (existsSync(pkgJsonUri)) {
    return pkgJsonUri
  }
  return getRootPackageUri(parent)
}
