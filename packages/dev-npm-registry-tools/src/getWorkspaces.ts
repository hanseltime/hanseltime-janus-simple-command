import { join, resolve } from 'path'
import glob from 'glob'
import { readFileSync } from 'fs'
import { Body } from 'types-package-json'

// TODO: this is a slight copy past from monorepo-tools to avoid circular dependencies
export interface WorkSpaceInfo {
  // Absolute url to the workspace package.json
  url: string
  // The pkg Name
  pkgName: string
  // If the package is package.json private
  private: boolean
  // The version of the package
  version: string
}

/**
 * Returns the workspaces associated with the root project in this monorepo
 *
 * @param {string} packageJsonDir the path to the directory with the package.json that we want to look at
 * @returns {Promise<{url: string, pkgName: string, private: boolean}[]>} Returns an array of absolute urls to
 *    the packagejson for a given pkgName.
 */
export async function getWorkspaces(packageJsonDir: string): Promise<WorkSpaceInfo[]> {
  const workspaceInfo: {
    url: string
    pkgName: string
    private: boolean
    version: string
  }[] = []
  const rootPackageJson = JSON.parse(readFileSync(resolve(packageJsonDir, 'package.json')).toString()) as Body
  if (!rootPackageJson) {
    throw new Error(`Cannot find package JSON at ${packageJsonDir}`)
  }
  if (!rootPackageJson || !rootPackageJson.workspaces) {
    return []
  }

  return new Promise((res) => {
    rootPackageJson.workspaces!.forEach((workspace, idx) => {
      glob(
        `${workspace}/package.json`,
        {
          cwd: packageJsonDir,
        },
        (er, files) => {
          files.forEach((file) => {
            const json = JSON.parse(readFileSync(join(packageJsonDir, file)).toString()) as Body
            workspaceInfo.push({
              url: resolve(packageJsonDir, file),
              pkgName: json.name,
              private: !!json.private,
              version: json.version,
            })
          })
          if (idx === rootPackageJson.workspaces!.length - 1) {
            res(workspaceInfo)
          }
        },
      )
    })
  })
}

module.exports = {
  getWorkspaces,
}
