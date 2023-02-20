# monorepo-tools

This is the package that adds tool functions for building this monorepos.

The tools in this package predominantly deal with creating new scaffolds of a package with the understanding of the larger monorepo structure.

# Commands

This package exposes several scripts that are meant to be used during the orchestration process of different monorepo steps.
Below are some examples. Please review the actual typings and/or `--help` to better understand your options

## new-package

The new-package command will skeleton out a basic package within your packages folder (this is analogous to yarn/npm workspaces). By default, this command will also commit the initial package infrastructure in order to ensure
that you have a bundled feature commit.

### For a new library (internal to the monorepo)

```shell
yarn new-package lib --pkgDir packages my-library
```

This command will create a package at the folder "my-library" and mark it as `private: true`
which will keep it only usable internally via yarn workspaces.

### For a new published library

```shell
yarn new-package lib --pkgDir packages --publish my-library
```

This command will create a package at the folder "my-library" that should have a semantic release cycle associated with it

## no-public-private-deps

Given that we are now creating things in monorepos, we run the risk of publishing a package that lists a
monorepo-internal package within its package.json.  This would lead to there being failures on install 
potentially.  This command can be used in CI / commit linting to ensure that a developer isn't adding
a non-publishable workspace dependency

```
yarn no-public-private-deps
```

## setup-deps-for-workspaces

Another side effect of us using semantic-multirelease is that a commit is created for each publish that maps any
monorepo workspace dependencies to a concrete type.  We want this, but you can use this script after a release to
set source control back to workspaces for more rapid development and leveraging yarn workspaces.

```
yarn setup-deps-for-workspaces
```
