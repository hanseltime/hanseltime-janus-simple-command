/**
 * Because we don't want to depend on private packages (since they can't really be a dependency for public package)
 * we want to make sure that we don't commit private packages into a public package
 */
import { readFileSync } from 'fs'
import { Body } from 'types-package-json'
import { getWorkspaces } from './getWorkspaces'

export interface NoPublicPrivateDepsOptions {
  // The directory with a package json that we want
  dir: string
}

export async function noPublicPrivateDeps(options: NoPublicPrivateDepsOptions) {
  const wsDataArr = await getWorkspaces(options.dir)

  const internalPrivate = wsDataArr.filter((wsData) => wsData.private).map((wsData) => wsData.pkgName)
  const publicWorkspaces = wsDataArr.filter((wsData) => !wsData.private)

  const privateIncluded: string[] = []
  publicWorkspaces.forEach((ws) => {
    const pkgJson = JSON.parse(readFileSync(ws.url).toString()) as Body

    if (pkgJson.dependencies) {
      Object.keys(pkgJson.dependencies).forEach((dep) => {
        if (internalPrivate.includes(dep)) {
          privateIncluded.push(`${ws.pkgName} -> ${dep}`)
        }
      })
    }
    if (pkgJson.devDependencies) {
      Object.keys(pkgJson.devDependencies).forEach((dep) => {
        if (internalPrivate.includes(dep)) {
          privateIncluded.push(`${ws.pkgName} -> ${dep}`)
        }
      })
    }
  })

  if (privateIncluded.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`
    Cannot include dependencies on public packages:

    ${privateIncluded.join('\n')}

    In order to fix this, please either separate the private package into a deployable public package
    or turn the whole thing public if possible.  We need available dependencies for any library.
    
    `)
    process.exit(1)
  }
}
