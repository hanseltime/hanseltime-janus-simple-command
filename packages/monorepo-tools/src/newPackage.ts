import { rmSync } from 'fs'
import { join, relative } from 'path'
import { copySync } from 'fs-extra'
import { newPackageWrapper, WrapperContext, WrapperOptions } from './newPackageWrapper'
import { Respository } from './packageJsonTypes'
import { PkgTemplateContext, transformHandleBars } from './transformHandlebars'

type TemplateContext = PkgTemplateContext

export interface NewLibOptions extends WrapperOptions {
  type: 'lib'
  // If set to true, this means that we are setting up the repo to publish to our internal npm registry
  publish: boolean
}

export type NewPackageOptions = NewLibOptions

export const newPackage = newPackageWrapper((options: NewPackageOptions, ctx: WrapperContext) => {
  const { rootDir, workspace, type } = options
  const { workspaceUri, repository } = ctx

  const isLib = type === 'lib'

  copySync(join(__dirname, '..', 'base-library-repo'), workspaceUri)

  const handlebarsContext: TemplateContext = {
    toRoot: relative(workspaceUri, rootDir),
    libName: workspace,
    isLib,
    isPublished: !!(options as NewLibOptions).publish,
    repository: (repository as Respository).url ?? repository,
    sameMonoRepo: ctx.sameMonoRepo,
  }

  // Apply handlebars templating to package.json
  transformHandleBars(workspaceUri, 'package.json', handlebarsContext)
  transformHandleBars(workspaceUri, 'webpack.config.js', handlebarsContext)
  transformHandleBars(workspaceUri, 'README.md', handlebarsContext)
  transformHandleBars(workspaceUri, 'release.config.js', handlebarsContext)
  transformHandleBars(workspaceUri, 'Dockerfile', handlebarsContext)

  // Dockerfiles don't need to be created
  rmSync(join(workspaceUri, 'Dockerfile'))
  //no deployment in libs

  // we just use tsc for now, but if you want to tweak for more compact libraries, we can keep webpack
  rmSync(join(workspaceUri, 'webpack.config.js'))
})
