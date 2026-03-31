import * as ts from 'typescript'
import { parse as parseTemplate, type TemplateChildNode, type ElementNode } from '@vue/compiler-dom'
import { HTML_TAGS } from './html-tags'

export interface VueComponentInfo {
  name: string
  props: VuePropInfo[]
  emits: string[]
  childComponents: string[] // PascalCase names used in template
}

export interface VuePropInfo {
  name: string
  type: string
  required: boolean
}

/**
 * Extract child component names used in a Vue template.
 * Returns PascalCase names (converts kebab-case to PascalCase).
 */
export function extractTemplateComponents(templateContent: string): string[] {
  let ast
  try {
    ast = parseTemplate(templateContent)
  } catch {
    return []
  }

  const components = new Set<string>()

  function visit(node: TemplateChildNode) {
    // type 1 = ELEMENT
    if (node.type === 1) {
      const el = node as ElementNode
      const tag = el.tag
      if (!HTML_TAGS.has(tag.toLowerCase())) {
        components.add(toPascalCase(tag))
      }
      if (el.children) el.children.forEach(visit)
    }
    // type 9 = IF, type 11 = FOR - have branches/children
    const nodeRecord = node as unknown as Record<string, unknown>
    if ('branches' in node) {
      for (const branch of nodeRecord.branches as {
        children?: TemplateChildNode[]
      }[]) {
        if (branch.children) branch.children.forEach(visit)
      }
    }
    if ('children' in node && Array.isArray(nodeRecord.children)) {
      ;(nodeRecord.children as TemplateChildNode[]).forEach(visit)
    }
  }

  ast.children.forEach(visit)
  return Array.from(components)
}

/**
 * Extract props from defineProps<T>() in script setup.
 */
export function extractDefineProps(sourceFile: ts.SourceFile): VuePropInfo[] {
  const props: VuePropInfo[] = []

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineProps'
    ) {
      // defineProps<{ name: string; age?: number }>()
      if (node.typeArguments && node.typeArguments.length > 0) {
        const typeArg = node.typeArguments[0]
        if (ts.isTypeLiteralNode(typeArg)) {
          for (const member of typeArg.members) {
            if (ts.isPropertySignature(member) && member.name) {
              const name = member.name.getText(sourceFile)
              const type = member.type ? member.type.getText(sourceFile) : 'any'
              const required = !member.questionToken
              props.push({ name, type, required })
            }
          }
        }
      }

      // defineProps({ name: { type: String, required: true } })
      if (node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
        for (const prop of node.arguments[0].properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const name = prop.name.text
            let type = 'any'
            let required = false

            if (ts.isObjectLiteralExpression(prop.initializer)) {
              for (const inner of prop.initializer.properties) {
                if (ts.isPropertyAssignment(inner) && ts.isIdentifier(inner.name)) {
                  if (inner.name.text === 'type') type = inner.initializer.getText(sourceFile)
                  if (
                    inner.name.text === 'required' &&
                    inner.initializer.kind === ts.SyntaxKind.TrueKeyword
                  )
                    required = true
                }
              }
            } else {
              type = prop.initializer.getText(sourceFile)
            }

            props.push({ name, type, required })
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return props
}

/**
 * Extract emit names from defineEmits<T>() in script setup.
 */
export function extractDefineEmits(sourceFile: ts.SourceFile): string[] {
  const emits: string[] = []

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineEmits'
    ) {
      // defineEmits<{ (e: 'submit'): void; (e: 'cancel'): void }>()
      if (node.typeArguments && node.typeArguments.length > 0) {
        const typeArg = node.typeArguments[0]
        if (ts.isTypeLiteralNode(typeArg)) {
          for (const member of typeArg.members) {
            if (ts.isCallSignatureDeclaration(member) && member.parameters.length > 0) {
              const firstParam = member.parameters[0]
              if (
                firstParam.type &&
                ts.isLiteralTypeNode(firstParam.type) &&
                ts.isStringLiteral(firstParam.type.literal)
              ) {
                emits.push(firstParam.type.literal.text)
              }
            }
          }
        }
      }

      // defineEmits(['submit', 'cancel'])
      if (node.arguments.length > 0 && ts.isArrayLiteralExpression(node.arguments[0])) {
        for (const el of node.arguments[0].elements) {
          if (ts.isStringLiteral(el)) {
            emits.push(el.text)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return emits
}

function toPascalCase(str: string): string {
  if (!str.includes('-')) return str.charAt(0).toUpperCase() + str.slice(1)
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}
