# Developing

## Tools

## Tools

- yarn v2
  - Please run `yarn dev-init` after running `corepack enable` (on node 18)
- node v18
- For monorepo version release and publishing [multi-semantic-release](https://www.npmjs.com/package/@qiwi/multi-semantic-release)
- For dependent package builds: [nx](https://nx.dev/getting-started/intro)

## IDE support

Since we are using Yarn Plug and Play in order to speed up package installation and running,
some IDE support requires additional configuration. Below is the recommended IDE for developing 
this repo:

VSCode

- Run `corepack enable`

- You will need to [activate the custom TS settings](https://yarnpkg.com/getting-started/editor-sdks#vscode)

- Restart your IDE

Other IDEs:

Your mileage may vary but you can look at setting up your IDE [here](https://yarnpkg.com/getting-started/editor-sdks)

## OS's

Currenlty, given the use of bash and suggested use of things like nvm, we recommend that you
develop for this project on a Unix machine.

## Package manager

This repository expects (yarn 2)[https://yarnpkg.com/] as it's package management tool.

Since you most likely have yarn 1, please run:

```sh
corepack enable
yarn dev-init
```

This will check if corepack is enabled to auto-select the correct yarn version for you.

### yarn CLI scripts

#### About

This repository is a monorepo repository so that you can group functionality into smaller library folders. These
folders allow us to isolate testing, dependencies, and even cache builds, tests, etc.

In order to facillitate the monorepo structure, we make use of [nx](https://nx.dev/) on top of [yarn workspaces](https://yarnpkg.com/features/workspaces). Most of these tools are abstracted away by repo-level scripts, so you will only need to understand those cli tools if you don't have a need for advanced command calls.

##### one vs all commands

In order to make terminal calls from the root more intuitive, there is the concept of "-one" commands.

**The Rule**

If it ends with "-one", then you need to provide the "P" environment variable to name the package you're targeting.

If it does not end with "-one", then the command should run in all repos it can be found ine

#### Commands

##### add-one

This command basically allows you to add a dependency to the package that you provided as P=<>.

**NOTE**: you can also use internal packages in the monorepo when adding this

```
P=janus-simple-command yarn add-one --dev some-package
```

**IMPORTANT**- If you have made a public package (one that will publish to a registry), then you **cannot**
make it depend on private packages in your monorepo. This is because your package itself will need to list
all dependencies that can be pulled from a registry and your internal private packages cannot.

###### If you need to use a private repo in a public repo

You should either be making the private package public as well, or you should be splitting out the private
package into a smaller public package and private package. Make sure whatever is public is good as a package
on its own (no db models etc.)

##### build(-one)

This runs typescript build on ALL projects in order of dependencies. Note, you need to build packages again in order
for the project that you're working on to get the updated types and functionality

##### dev-init

This is a one-time command that sets up `corepack` so that node will automatically use the correct version of yarn

##### lint

Lints the whole project

##### new-lib

This will scaffold an entire new library for your project.

```
# Makes a private library
yarn new-lib new-lib

#Makes a publishable library to our local github packages
yarn new-lib --publish new-public-lib
```

##### unit-test(-one)

Run unit tests for the given projects. Note you can use all jest options.

```sh
yarn unit-test # Runs all commands
```

##### int-test(-one)

Run integration tests for the given projects. Note you can use all jest options.

```sh
yarn int-test # Runs all commands
```

##### release

This will run release in every package and updated changes logs and create tags

**IMPORTANT** - this only should run from the ci/cd pipelines

## Minimum Node Development Version

We require that you keep the specified Node version for your development tools in this repo.
Please check the "engines" field in package.json

It is highly recommended that you manage node versions using (nvm)[https://github.com/nvm-sh/nvm]

## Development Branching strategy

This repo follows a main and alpha trunk style of feature development. With semantic-release as our release tool,
we can take advantage of 3 main branches:

- main - source of truth for package - create your branches off of this one
- alpha - The alpha branch that contributors should merge to so that we can formally test the package first

## Commit Messages

This project uses (Angular Commit Linting)[https://www.npmjs.com/package/@commitlint/config-angular]

In order to facillitate auto-changelog and auto-versioning, we enforce that you have
to write valid commits. If you are failing to commit, please refer to the console errors
to better understand what is allowed.

### Example:

```
feat: a bread machine
```

## Linting

This project uses prettier and eslint together to enforce formatting and javascript rules. If you have an
IDE that can auto-format off of prettier, it is recommended that you configure it, or at the very least
enable eslint for your IDE. All prettier formatting errors will show then and you can auto-format in most
IDES.

## Testing

This project uses Jest for it's testing. To avoid any combined concerns, we provide separate files for
integration tests and unit tests.

- myFile.spec.unit.ts

  - **Priority** - These are much more important to write if pressing up against scope

  - Unit tests should mock ALL interfaces for the file under test. Expect that there will be no connection
    to any external system.

- myFile.spec.int.ts

  - Integration tests that need to be connected to an integrated system. These will be much more custom
    and will involve updating the jest.int.config.js and related start-up files to ensure that the integration
    is set up safely.

## Running Locally

For faster local running of scripts, we use ts-node due to it's 1 step process to running data.

```sh
yarn ts-node <your file location in .ts>
```

# Locally developing this repository AND another local library

If you have the need to locally develop and test one library that is imported into another,
you can make use of the (verdaccio-develop-registry)[https://github.com/hanseltime/development-verdaccio].

By pulling this repo and running the server start command, you can then switch to a local npm registry that
will allow all @hanseltime/ scoped packages to be published to the local registry. It will also proxy all other packages from the npm registry.

## Commands for local registry

### set the local registry for all yarn installs/npm pulls

```sh
yarn use-local-registry
```

**IMPORTANT:** You cannot commit your yarn.lock if you install packages through this. It will reference the
localhost registry. We have a commit hook that will stop you. When you find it, please:

* revert your .yanrc.yml (adding back any things you may have installed that you meant to have there)

* Reinstall from actual registries
  ```sh
  # revert the yarn.lock file
  yarn
  ```

This will update the lock file for all regular registry packages.

### publish to the local registry after connecting to the local registry

```sh
yarn publish-local
```

## Develop Tools

- commitlint
  - For enforcing commit message format
- husky
  - For applying git hooks to guard against commits that would cause problems
- semantic-release
  - For auto-versioning, change-log, commit, and package publish
- jest (with ts-jest)
  - For running integration and unit tests
- eslint
  - For enforcing best practices with EcmaScript syntax
- prettier
  - For enforcing standard formatting across all commits in this repo
- source-map-support
  - Used for standardized stack trace outputs
