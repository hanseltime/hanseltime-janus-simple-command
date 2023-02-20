import { readFileSync } from 'fs'
import { join } from 'path'
import { Body } from './packageJsonTypes'

export function getPackageJson(dir: string): Body {
  return JSON.parse(readFileSync(join(dir, 'package.json')).toString()) as Body
}
