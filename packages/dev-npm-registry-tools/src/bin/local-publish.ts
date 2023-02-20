/* eslint-disable no-console */
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { createInterface } from 'readline'
import Handlebars from 'handlebars'
import yargsLib from 'yargs/yargs'
import { getRootPackageUri } from '../getRootPackageUri'
import { getWorkspaces } from '../getWorkspaces'

interface Options {
  // The folder with the package.json
  packageFolder: string
  // The host of the server - defaults to default verdaccio
  serverHost: string
  // The username to sign-in under - defaults to admin
  user: string
  // The username to sign-in under - defaults to admin
  password: string
}

type ArgsV = Options

const argv = yargsLib(process.argv.slice(2))
  .scriptName('local-publish')
  .usage('$0 [--user <username>] [--password <password>] [--serverHost <host>] [--packageFolder <folder>]')
  .positional('user', {
    default: 'admin',
    type: 'string',
    describe: 'the user to connect to the local verdaccio under',
  })
  .option('password', {
    default: 'admin',
    describe: 'The password to use with the user',
    type: 'string',
  })
  .option('serverHost', {
    default: 'http://localhost:4873/',
    describe: 'The fully qualified url of the local host server',
    type: 'string',
  })
  .option('packageFolder', {
    default: process.cwd(),
    describe: 'The folder to deploy',
    type: 'string',
  })
  .help()
  .parse() as unknown as ArgsV

async function main() {
  const pkgUrl = resolve(argv.packageFolder, 'package.json')
  const rcUrl = resolve(argv.packageFolder, '.yarnrc.yml')
  const templateRcUrl = resolve(__dirname, '..', '..', 'template-files', '.yarnrc.yml.handlebars')
  const currentPkg = readFileSync(pkgUrl).toString()
  const pkg = JSON.parse(currentPkg)

  const existingRC = existsSync(rcUrl) ? readFileSync(rcUrl) : null

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  await new Promise<void>((res) => {
    readline.question(
      `
  IMPORTANT!
  
      We are going to publish ${pkg.name}:${pkg.version} to ${argv.serverHost}.
  
      This is under ${argv.user}:${argv.password}.  Please visit http://localhost:4873 in the browser
      to see about logging in your user.
  
      Please make sure that you are running https://github.com/hanseltime/development-verdaccio.
  
      Call 'yarn server' in that repo, if not.
  
      Press any key to continue
  `,
      () => {
        readline.close()
        res()
      },
    )
  })

  try {
    // Override the publishConfig with an explicit config
    pkg.publishConfig = {
      registry: argv.serverHost,
    }

    // Check if we're in a monorepo
    const rootPkgUri = getRootPackageUri(argv.packageFolder)
    if (rootPkgUri) {
      // Replace any "workspace:^" versions
      const workspaceInfo = await getWorkspaces(dirname(rootPkgUri))
      const workspaceVersions = workspaceInfo.reduce((map, info) => {
        map[info.pkgName] = info.version
        return map
      }, {} as { [key: string]: string })
      const deps = pkg.dependencies ?? {}
      const devDeps = pkg.devDependencies ?? {}
      Object.keys(deps).forEach((k) => {
        const version = deps[k]
        if (version === 'workspace:^') {
          if (!workspaceVersions[k]) {
            console.log(`Workspace version is not found in package root: ${k}`)
            process.exit(1)
          }
          deps[k] = workspaceVersions[k]
        }
      })
      Object.keys(devDeps).forEach((k) => {
        const version = devDeps[k]
        if (version === 'workspace:^') {
          if (!workspaceVersions[k]) {
            console.log(`Workspace version is not found in package root: ${k}`)
            process.exit(1)
          }
          devDeps[k] = workspaceVersions[k]
        }
      })
    }

    writeFileSync(pkgUrl, JSON.stringify(pkg, null, 4))

    // write a local .yarnrc.yml temporarily
    const templateRc = Handlebars.compile(readFileSync(templateRcUrl).toString())
    writeFileSync(
      rcUrl,
      templateRc({
        user: argv.user,
        password: argv.password,
        serverHost: argv.serverHost,
      }),
    )

    spawnSync('yarn', ['npm', 'publish'], {
      stdio: 'inherit',
    })
  } finally {
    // Reset the pkg config
    writeFileSync(pkgUrl, currentPkg)

    // Reset the yarnrc
    if (existingRC) {
      writeFileSync(rcUrl, existingRC)
    } else {
      unlinkSync(rcUrl)
    }
  }
}

void main()
