import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import Handlebars from 'handlebars'

export interface PkgTemplateContext {
  // The relative url to the root directory for the file
  toRoot: string
  // The name of the library/app
  libName: string
  // If this is for a library
  isLib: boolean
  // If this gets published to the registry
  isPublished: boolean
  // The url for the repository
  repository: string
  // If we are expecting the package to be created in the same monorepo
  sameMonoRepo: boolean
}

/**
 * Takes a handlebars file and creates a compilation with the same name minus the handlebars ending
 * @param folderUri
 * @param transformedFile
 * @param context
 */
export function transformHandleBars<T>(folderUri: string, transformedFile: string, context: T) {
  const uri = join(folderUri, `${transformedFile}.handlebars`)
  const template = Handlebars.compile(readFileSync(uri).toString())
  writeFileSync(uri, template(context))
  renameSync(uri, join(folderUri, transformedFile))
}
