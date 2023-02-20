/* eslint-disable no-console */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import Handlebars from 'handlebars'
import yargsLib from 'yargs/yargs'
import yaml from 'js-yaml'

interface Options {
  // The folder with the package.json
  packageFolder: string
  // The host of the server - defaults to default verdaccio
  serverHost: string
  // The username to sign-in under - defaults to admin
  user: string
  // The username to sign-in under - defaults to admin
  password: string

  scope: string
}

type ArgsV = Options

// TODO: we can parameterize the scope to select
const argv = yargsLib(process.argv.slice(2))
  .scriptName('use-local-registry')
  .usage(
    '$0 [--user <username>] [--password <password>] [--serverHost <host>] [--packageFolder <folder>] [--scope <scope>]',
  )
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
  .option('scope', {
    default: '',
    describe: 'The scope we want to put to local',
    type: 'string',
  })
  .help(
    'Overrides or adds a .yarnrc.yml file in the specified packageFolder with localhost settings for scope provided',
  )
  .parse() as unknown as ArgsV

const rcUrl = resolve(argv.packageFolder, '.yarnrc.yml')
const templateRcUrl = resolve(__dirname, '..', '..', 'template-files', '.yarnrc.yml.handlebars')

if (existsSync(rcUrl)) {
  const rawYaml = readFileSync(rcUrl).toString()
  const rcObj = yaml.load(rawYaml) as any

  const origScope = rcObj?.npmScopes?.[argv.scope]
  const origUnsafeHttpWhitelist = rcObj?.unsafeHttpWhitelist

  const authIdent = `${argv.user}:${argv.password}`
  const server = argv.serverHost

  const alreadySetup =
    authIdent === origScope?.npmAuthIdent &&
    server === origScope?.npmRegistryServer &&
    origUnsafeHttpWhitelist?.includes('localhost')

  if (!alreadySetup) {
    const commentedYaml = rawYaml.split('\n').reduce((s, line) => {
      return `${s}#${line}\n`
    }, '# Original yarn file commented out here. DO NOT COMMIT like this\n')

    if (!rcObj?.npmScopes) {
      rcObj.npmScopes = {}
    }

    rcObj.npmScopes[argv.scope] = {
      npmRegistryServer: argv.serverHost,
      npmAuthIdent: `${argv.user}:${argv.password}`,
    }

    if (!rcObj.unsafeHttpWhitelist) {
      rcObj.unsafeHttpWhitelist = []
    }

    if (!rcObj.unsafeHttpWhitelist.includes('localhost')) {
      rcObj.unsafeHttpWhitelist = [...(rcObj as any).unsafeHttpWhitelist, 'localhost']
    }

    writeFileSync(rcUrl, `${commentedYaml}${yaml.dump(rcObj)}`)
  }
} else {
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
}

console.log(`
IMPORTANT!

    To revert this configuration please revert your .yarnrc.yml file.  It has been modified
    to allow for the localhost verdaccio.

    Please make sure that you are running https://github.com/hanseltime/development-verdaccio.

    Call 'yarn server' in that repo.

`)
