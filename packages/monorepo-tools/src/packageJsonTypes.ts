export interface HasEmail {
  email: string
}
export interface HasName {
  name: string
}
export interface HasUrl {
  url: string
}
export declare type Address = HasEmail | HasUrl | (HasUrl & HasEmail)
export declare type Person = (HasName & Partial<Address>) | string
export interface Respository {
  directory?: string
  type: 'git' | 'svn'
  url: string
}
export interface Directories {
  bin: string
  doc: string
  example: string
  lib: string
  man: string
  test: string
}
export interface UrlRef {
  type?: string
  url: string
}
/** @deprecated */
export declare type License = UrlRef
export declare type Dictionary = Record<string, string>
export declare type Browser = Record<string, unknown>
export interface TypeScriptBody {
  types: string
  typings?: string
}
export interface YarnBody {
  flat: boolean
  peerDependenciesMeta: Record<
    string,
    {
      optional: boolean
    }
  >
  resolutions: Dictionary
  workspaces: string[]
}
export interface OptionalBody {
  author: Person
  bin: Dictionary
  browser: string | Browser
  bugs: string | Address
  bundledDependencies: string[]
  collective: string | UrlRef
  config: Record<string, unknown>
  contributors: Person[]
  cpu: string[]
  dependencies: Dictionary
  description: string
  devDependencies: Dictionary
  directories: Partial<Directories>
  engines: Dictionary
  /** @deprecated since npm 3.0.0 */
  engineStrict: boolean
  files: string[]
  funding: string | UrlRef
  homepage: string
  keywords: string[]
  license: string | License
  /** @deprecated was never official */
  licenses: License[]
  main: string
  man: string | string[]
  optionalDependencies: Dictionary
  os: string[]
  peerDependencies: Dictionary
  /** @deprecated */
  preferGlobal: boolean
  private: boolean
  publishConfig: Dictionary
  repository: Respository | string
  scripts: Dictionary
}
export interface Body extends Partial<OptionalBody>, Partial<TypeScriptBody>, Partial<YarnBody> {
  name: string
  version: string
}
