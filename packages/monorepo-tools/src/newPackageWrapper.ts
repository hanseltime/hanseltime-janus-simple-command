import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve, basename } from 'path'
import { getPackageJson } from './getPackageJson'
import { Body, Respository } from 'types-package-json'
import { spawnSync } from 'child_process'

export interface WrapperOptions {
  // The root directory of the monorepo
  rootDir: string
  // The directory where add packages relative to the rootDir
  pkgDir: string
  workspace: string
  // If set to true, we apply an initial commit so that we can track most of repo stuff
  initialCommit: boolean
}

export interface WrapperContext {
  // The uri of the workspace that we want to create (and have registered in the root)
  workspaceUri: string
  // The repository object (from package.json) of the root repository
  repository: string | Respository
  // the location of the dev docker compose file
  devComposePath: string
  // If we are expecting the package to be created in the same monorepo
  sameMonoRepo: boolean
}

const thisPackage = getPackageJson(join(__dirname, '..'))

/**
 * Wrapper function for creating new package functions in a monorepo.
 *
 * It removes a lot of the assumptions around git history management
 * and updating the root package.json
 * @param newPackageFcn - This function should set up the actual workSpaceUri folder and files
 * @returns
 */
export function newPackageWrapper<T extends WrapperOptions>(
  newPackageFcn: (options: T, context: WrapperContext) => void,
) {
  return (options: T) => {
    const { rootDir, pkgDir, workspace, initialCommit } = options

    let stashedFiles = false

    const files = spawnSync('git', ['status', '--porcelain'])
    if (files.stdout.toString().trim()) {
      // eslint-disable-next-line no-console
      console.log('Stashing current files for commit')
      const stash = spawnSync('git', ['stash', '--include-untracked'])
      if (stash.error) {
        throw stash.error
      }
      stashedFiles = true
    }

    try {
      // Update the package.json for both
      const packageJson = getPackageJson(rootDir) as Body
      const packageJsonUri = join(rootDir, 'package.json')
      if (!packageJson) {
        throw new Error('Could not find package.json in call directory')
      }

      if (!packageJson.repository) {
        throw new Error('Could find repository in root package.json.  Must have a repository.')
      }

      const repositoryUrl =
        typeof packageJson.repository === 'string'
          ? packageJson.repository
          : (packageJson.repository as Respository).url
      const thisRepositoryUrl =
        typeof thisPackage.repository === 'string'
          ? thisPackage.repository
          : (thisPackage.repository as Respository).url
      const sameMonoRepo = repositoryUrl === thisRepositoryUrl

      const workspaceUri = join(rootDir, pkgDir, workspace)

      // Make the workspace directory
      mkdirSync(workspaceUri)
      // Add the workspace to the package.json
      if (!packageJson!.workspaces!.includes(join(pkgDir, workspace))) {
        packageJson!.workspaces!.push(join(pkgDir, workspace))
        writeFileSync(packageJsonUri, JSON.stringify(packageJson, null, 4))
      } else {
        // eslint-disable-next-line no-console
        console.log('skipping updating root workspaces, already there')
      }

      newPackageFcn(options, {
        workspaceUri,
        repository: packageJson.repository,
        sameMonoRepo,
      })

      // Run the install again
      spawnSync('yarn', ['install'], {
        stdio: 'inherit',
      })

      // Add a commit for release to work
      if (initialCommit) {
        spawnSync('git', ['add', '-A'], {
          stdio: 'inherit',
        })
        spawnSync('git', ['commit', '-m', `feat: initial base folder for @hanseltime/${workspace}`], {
          stdio: 'inherit',
        })
      }
    } finally {
      if (stashedFiles) {
        // eslint-disable-next-line no-console
        console.log('Restoring Changes after initial commit!  IMPORTANT: you may need to resolve conflicts.')

        spawnSync('git', ['stash', 'pop'], {
          stdio: 'inherit',
        })
      }
    }
  }
}
