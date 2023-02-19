/* eslint-disable no-console */
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { Body } from 'types-package-json
'
import { getWorkspaces } from './getWorkspaces'

export interface SetupDependenciesOptions {
  // The directory with a package json that we want
  dir: string
}

const GIT_TOKEN = process.env.GITHUB_TOKEN

/**
 * Combs all workspaces in a monorepo root and ensures that they are all pointing to the workspaces
 * and commits them.
 *
 * This is a script that compensates for the multi-semantic-release hard upgrading packages to a standard version
 * which does not allow for rapid development.
 * @param options
 */
export async function setupDependenciesForWorkspaces(options: SetupDependenciesOptions) {
  const wsDataArr = await getWorkspaces(options.dir)

  const workspaceDependencies = wsDataArr.reduce((set, wsData) => {
    set.add(wsData.pkgName)
    return set
  }, new Set())

  function replaceDependenciesWithYarnLinks(dependencies: {
    [dep: string]: string
  }): [{ [deps: string]: string }, boolean] {
    let changed = false
    return [
      Object.keys(dependencies).reduce((deps, depName) => {
        if (workspaceDependencies.has(depName) && dependencies[depName] !== 'workspace:^') {
          deps[depName] = 'workspace:^'
          changed = true
        } else {
          deps[depName] = dependencies[depName]
        }
        return deps
      }, {} as { [dep: string]: string }),
      changed,
    ]
  }

  const filesForCommit: string[] = []
  wsDataArr.forEach((wsData) => {
    const json = JSON.parse(readFileSync(wsData.url).toString()) as Body

    let update = false
    if (json.dependencies) {
      const [deps, changed] = replaceDependenciesWithYarnLinks(json.dependencies)
      if (changed) {
        json.dependencies = deps
        update = true
      }
    }
    if (json.devDependencies) {
      const [deps, changed] = replaceDependenciesWithYarnLinks(json.devDependencies)
      if (changed) {
        json.devDependencies = deps
        update = true
      }
    }

    if (update) {
      writeFileSync(wsData.url, JSON.stringify(json, null, 4))
      filesForCommit.push(wsData.url)
    }
  })

  if (filesForCommit.length > 0) {
    const resetRet = spawnSync('git', ['reset', 'HEAD'], { stdio: 'inherit' })
    if (resetRet.error) {
      throw resetRet.error
    }
    // Reinstall to workspace spec
    const yarnRet = spawnSync('yarn', [], { stdio: 'inherit' })
    if (yarnRet.error) {
      throw yarnRet.error
    }
    const addRet = spawnSync('git', ['add', '.yarn/install-state.gz', ...filesForCommit], { stdio: 'inherit' })
    if (addRet.error) {
      throw addRet.error
    }
    // Make sure changes happened
    const diffRet = spawnSync('git', ['diff', '--cached', '--stat'])
    if (diffRet.error) {
      throw diffRet.error
    }
    if (diffRet.stdout.toString().trim().length > 0) {
      const ret = spawnSync(
        'git',
        ['commit', '-m', 'build: [skip ci]\n\nRe-enable yarn workspaces for monorepo development'],
        {
          stdio: 'inherit',
        },
      )
      if (ret.error) {
        throw ret.error
      }
      // Make sure we're not on an ephemeral branch (if so, then find GIT_BRANCH)
      const branchRet = spawnSync('git', ['branch', '--show-current'])
      let branch = branchRet.stdout.toString().trim()
      if (!branch) {
        if (!process.env.BRANCH_NAME) {
          throw new Error('On detached branch with no BRANCH_NAME environment variable.  Cannot push.')
        }
        console.log(`On Detached branch, so using ${process.env.BRANCH_NAME} as target`)
        branch = process.env.BRANCH_NAME
      }

      const originRet = spawnSync('git', ['remote', 'get-url', '--push', 'origin'])
      const originUrl = originRet.stdout.toString().trim()
      if (originRet.error || !originUrl) {
        throw originRet.error
      }
      let authedOrigin = originUrl
      if (GIT_TOKEN) {
        authedOrigin = `${originUrl.replace('https://', `https://${GIT_TOKEN}@`)}`
      }

      const pushRet = spawnSync('git', ['push', authedOrigin, `HEAD:${branch}`], {
        stdio: 'inherit',
      })
      if (pushRet.error) {
        throw pushRet.error
      }
    }
  }
}
