/* eslint-disable no-console */
import { setupDependenciesForWorkspaces } from '../setupDepsForWorkspaces'
import yargsLib from 'yargs/yargs'

interface ArgsV {
  rootDir: string
}

const argv = yargsLib(process.argv.slice(2))
  .scriptName('setup-deps-for-workspaces')
  .usage('$0 [--rootDir <dir>]')
  .option('rootDir', {
    default: process.cwd(),
    describe: 'The root directory where the package.json of the monorepo is',
    type: 'string',
  })
  .help()
  .parse() as unknown as ArgsV

void setupDependenciesForWorkspaces({
  dir: argv.rootDir,
})
  .then(() => {
    process.exit()
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
