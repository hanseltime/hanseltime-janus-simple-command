# dev-npm-registry-tools

This package presents tools for developing packages between repositories locally.
This is particularly important when you are trying to change a package whose most
affected use case is in another repo. Rather than going through full release cycles,
you can set up a local developer registry and then publish and load from it.

**Important** - This package currently only supports yarn v2. Please contribue yarn v1/npm
equivalents when necessary.

# Setting up a local registry

These scripts rely on the repository that you're supposed to clone and run a registry
from. [Registry Project](https://github.com/hanseltime/development-verdaccio)

You will also need to create a user and password (if you don't want to use the default "admin":"admin")

[Creating a user](https://verdaccio.org/docs/setup-npm#creating-user)

# Publishing your package locally

If you are in a package that you would like to package to the local repo for pulling into your supporting
project, you will need to run:

```shell
yarn local-publish
```

Please check the help for other options.
