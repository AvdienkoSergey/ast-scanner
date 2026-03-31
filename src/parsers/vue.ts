import { parse as parseSFC } from '@vue/compiler-sfc'
import * as path from 'path'
import { VueScriptInfo, VueFileInfo, FunctionInfo } from '../types'
import { parseTypeScriptFile } from './typescript'
import { extractFunctions } from '../extractors/functions'

export function parseVueFile(content: string, filename: string): VueScriptInfo | null {
  const { descriptor, errors } = parseSFC(content, { filename })

  if (errors.length > 0) {
    console.warn(
      `Parse errors in ${filename}:`,
      errors.map((e) => e.message)
    )
  }

  if (descriptor.scriptSetup) {
    return {
      content: descriptor.scriptSetup.content,
      lang: (descriptor.scriptSetup.lang as 'ts' | 'js') ?? 'js',
      isSetup: true,
      startLine: descriptor.scriptSetup.loc.start.line
    }
  }

  if (descriptor.script) {
    return {
      content: descriptor.script.content,
      lang: (descriptor.script.lang as 'ts' | 'js') ?? 'js',
      isSetup: false,
      startLine: descriptor.script.loc.start.line
    }
  }

  return null
}

/**
 * Full Vue file parse - returns script, template, and component name.
 */
export function parseVueFileFull(content: string, filename: string): VueFileInfo {
  const { descriptor } = parseSFC(content, { filename })

  const baseName = path.basename(filename, '.vue')
  const componentName = baseName.charAt(0).toUpperCase() + baseName.slice(1)

  let script: VueScriptInfo | null = null
  if (descriptor.scriptSetup) {
    script = {
      content: descriptor.scriptSetup.content,
      lang: (descriptor.scriptSetup.lang as 'ts' | 'js') ?? 'js',
      isSetup: true,
      startLine: descriptor.scriptSetup.loc.start.line
    }
  } else if (descriptor.script) {
    script = {
      content: descriptor.script.content,
      lang: (descriptor.script.lang as 'ts' | 'js') ?? 'js',
      isSetup: false,
      startLine: descriptor.script.loc.start.line
    }
  }

  const templateContent = descriptor.template?.content ?? null

  return { script, templateContent, componentName }
}

export function extractVueFunctions(content: string, filename: string): FunctionInfo[] {
  const scriptInfo = parseVueFile(content, filename)
  if (!scriptInfo) return []

  const sourceFile = parseTypeScriptFile(filename.replace('.vue', '.ts'), scriptInfo.content)

  const functions = extractFunctions(sourceFile)

  return functions.map((fn) => ({
    ...fn,
    line: fn.line + scriptInfo.startLine - 1
  }))
}
