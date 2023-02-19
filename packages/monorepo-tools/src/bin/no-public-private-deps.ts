/* eslint-disable no-console */
import yargsLib from 'yargs/yargs'
import { noPublicPrivateDeps } from '../noPublicPrivateDeps'

interface ArgsV {
  pkgDir: string
}

const argv = yargsLib(process.argv.slice(2))
  .scriptName('no-public-private-deps')
  .usage('$0 [--pkgDir <dir>]')
  .option('pkgDir', {
    default: process.cwd(),
    describe: 'The directory where the package.json is that we are checking',
    type: 'string',
  })
  .help()
  .parse() as unknown as ArgsV

void noPublicPrivateDeps({
  dir: argv.pkgDir,
})
  .then(() => {
    process.exit()
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
