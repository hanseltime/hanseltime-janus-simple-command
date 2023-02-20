/* eslint-disable no-console */
import yargsLib from 'yargs/yargs'
import { newPackage } from '../newPackage'

type Cmds = 'lib'
interface BaseOptions {
  // The workspace/package name
  workspace: string
  // If true, we will not do an initial commit - defaults to false
  noCommit: boolean
  // The pkg Directory relative path
  pkgDir: string
  // The root directory of the monorepo
  rootDir: string
}
interface LibOptions extends BaseOptions {
  // If true, we are setting it up to publish to a registry
  publish: boolean
}

type ArgsV = {
  _: [Cmds]
} & LibOptions

const isLib = (argv: ArgsV): argv is { _: [Cmds] } & LibOptions => {
  const [cmd] = argv._
  if (cmd === 'lib') {
    return true
  }
  return false
}

const argv = yargsLib(process.argv.slice(2))
  .scriptName('new-package')
  .usage('$0 <cmd> [args]')
  .command(
    'app [--rootDir <dir>] [--pkgDir <dir>] [--noCommit] <workspace>',
    'create a new application at the workspace folder',
    (yargs) => {
      yargs
        .positional('workspace', {
          type: 'string',
          describe: 'the folder of the package',
        })
        .option('rootDir', {
          default: process.cwd(),
          describe: 'The root directory of the monorepo where the workspace will go',
          type: 'string',
        })
        .option('pkgDir', {
          default: 'packages',
          describe: 'The directory where the workspace will go within the root dir',
          type: 'string',
        })
        .option('noCommit', {
          default: false,
          describe: 'If we should skip base committing the package for better semantic releasing',
          type: 'boolean',
        })
        .option('deploy', {
          describe: 'deployment methed to use for new app, valid options: <argocd>, leave blank for no deployment',
          type: 'string',
        })
        .demandOption('workspace')
    },
  )
  .command(
    'db-lib [--rootDir dir] [--pkgDir dir] [--noCommit] [--db db] <workspace>',
    'create a db-models repo for a single db at the workspace folder',
    (yargs) => {
      yargs
        .positional('workspace', {
          type: 'string',
          describe: 'the folder of the package',
        })
        .option('rootDir', {
          default: process.cwd(),
          describe: 'The root directory of the monorepo where the workspace will go',
          type: 'string',
        })
        .option('pkgDir', {
          default: 'packages',
          describe: 'The directory where the workspace will go within the root dir',
          type: 'string',
        })
        .option('noCommit', {
          default: false,
          describe: 'If we should skip base committing the package for better semantic releasing',
          type: 'boolean',
        })
        .demandOption(['workspace', 'db'])
    },
  )
  .command(
    'lib [--rootDir <dir>] [--pkgDir <dir>] [--publish] [--noCommit] <workspace>',
    'create a new library at the workspace folder',
    (yargs) => {
      yargs
        .positional('workspace', {
          type: 'string',
          describe: 'the folder of the package',
        })
        .option('rootDir', {
          default: process.cwd(),
          describe: 'The root directory of the monorepo where the workspace will go',
          type: 'string',
        })
        .option('pkgDir', {
          default: 'packages',
          describe: 'The directory where the workspace will go',
          type: 'string',
        })
        .option('publish', {
          default: false,
          describe: 'if the flag is provided the package is set up to deploy',
          type: 'boolean',
        })
        .option('noCommit', {
          default: false,
          describe: 'If we should skip base committing the package for better semantic releasing',
          type: 'boolean',
        })
        .demandOption('workspace')
    },
  )
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .parse() as unknown as ArgsV

const [cmd] = argv._
const { pkgDir, workspace, noCommit, rootDir } = argv
if (isLib(argv)) {
  const publish = !!argv.publish
  newPackage({
    type: 'lib',
    rootDir,
    pkgDir,
    workspace,
    publish,
    initialCommit: !noCommit,
  })
} else {
  console.error(`Unknown command: ${cmd}`)
  process.exit(1)
}
