export interface ParamInfo {
  name: string
  type: string
  optional: boolean
}

export interface FunctionInfo {
  name: string
  signature: string
  params: ParamInfo[]
  returnType: string
  isAsync: boolean
  isExported: boolean
  line: number
  jsdoc?: string
}

export interface ComponentInfo {
  name: string
  props: PropInfo[]
  isExported: boolean
  line: number
}

export interface PropInfo {
  name: string
  type: string
  required: boolean
}

export interface ImportInfo {
  localName: string
  importedName: string
  moduleSpecifier: string
}

export interface RawCall {
  callerName: string
  calleeName: string
}

// Tracks where a local variable came from:
// const { fn } = useFoo()  → { localName: 'fn', sourceFnName: 'useFoo' }
// const store = useXStore() → { localName: 'store', sourceFnName: 'useXStore' }
export interface CallBinding {
  localName: string
  sourceFnName: string
}

export interface EmitEntity {
  lid: string
  data: Record<string, unknown>
  refs?: { target: string; rel: string }[]
}

export interface ScanOptions {
  projectPath: string
  dbPath: string
  ctxBin?: string
  include?: string[]
  exclude?: string[]
  exportedOnly?: boolean
  quiet?: boolean
  precise?: boolean
}

export interface FileAnalysis {
  absolutePath: string
  relativePath: string
  functions: FunctionInfo[]
  imports: ImportInfo[]
  calls: RawCall[]
  bindings: CallBinding[]
  componentName: string | null
  childComponents: string[]
  props: PropInfo[]
  emits: string[]
  vueScriptContent: string | null
}

export interface VueScriptInfo {
  content: string
  lang: 'ts' | 'js'
  isSetup: boolean
  startLine: number
}

export interface VueFileInfo {
  script: VueScriptInfo | null
  templateContent: string | null
  componentName: string
}
