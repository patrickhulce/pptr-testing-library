import {readFileSync} from 'fs'
import * as path from 'path'
import {ElementHandle, EvaluateFn, JSHandle, Page} from 'puppeteer'
import waitForExpect from 'wait-for-expect'

import {IConfigureOptions, IQueryUtils, IScopedQueryUtils} from './typedefs'

const domLibraryAsString = readFileSync(
  path.join(__dirname, '../dom-testing-library.js'),
  'utf8',
).replace(/process.env/g, '{}')

/* istanbul ignore next */
function mapArgument(argument: any, index: number): any {
  return index === 0 && typeof argument === 'object' && argument.regex
    ? new RegExp(argument.regex, argument.flags)
    : argument
}

const delegateFnBodyToExecuteInPageInitial = `
  ${domLibraryAsString};

  const mappedArgs = args.map(${mapArgument.toString()});
  const moduleWithFns = fnName in __dom_testing_library__ ?
    __dom_testing_library__ :
    __dom_testing_library__.__moduleExports;
  return moduleWithFns[fnName](container, ...mappedArgs);
`

let delegateFnBodyToExecuteInPage = delegateFnBodyToExecuteInPageInitial

type DOMReturnType = ElementHandle | ElementHandle[] | null

type ContextFn = (...args: any[]) => ElementHandle

async function createElementHandleArray(handle: JSHandle): Promise<ElementHandle[]> {
  const lengthHandle = await handle.getProperty('length')
  const length = (await lengthHandle.jsonValue()) as number

  const elements: ElementHandle[] = []
  for (let i = 0; i < length; i++) {
    const jsElement = await handle.getProperty(i.toString())
    const element = await createElementHandle(jsElement)
    if (element) elements.push(element)
  }

  return elements
}

async function createElementHandle(handle: JSHandle): Promise<ElementHandle | null> {
  const element = handle.asElement()
  if (element) return element
  await handle.dispose()
  return null // tslint:disable-line
}

async function covertToElementHandle(handle: JSHandle, asArray: boolean): Promise<DOMReturnType> {
  return asArray ? createElementHandleArray(handle) : createElementHandle(handle)
}

function processNodeText(handles: IHandleSet): Promise<string> {
  return handles.containerHandle
    .executionContext()
    .evaluate(handles.evaluateFn, handles.containerHandle, 'getNodeText')
}

async function processQuery(handles: IHandleSet): Promise<DOMReturnType> {
  const {containerHandle, evaluateFn, fnName, argsToForward} = handles

  try {
    const handle = await containerHandle
      .executionContext()
      .evaluateHandle(evaluateFn, containerHandle, fnName, ...argsToForward)
    return await covertToElementHandle(handle, fnName.includes('All'))
  } catch (err) {
    err.message = err.message.replace('[fnName]', `[${fnName}]`)
    err.stack = err.stack.replace('[fnName]', `[${fnName}]`)
    throw err
  }
}

interface IHandleSet {
  containerHandle: ElementHandle
  evaluateFn: EvaluateFn
  fnName: string
  argsToForward: any[]
}

function createDelegateFor<T = DOMReturnType>(
  fnName: keyof IQueryUtils,
  contextFn?: ContextFn,
  processHandleFn?: (handles: IHandleSet) => Promise<T>,
): (...args: any[]) => Promise<T> {
  // @ts-ignore
  processHandleFn = processHandleFn || processQuery

  const convertRegExp = (regex: RegExp) => ({regex: regex.source, flags: regex.flags})

  return async function(...args: any[]): Promise<T> {
    // @ts-ignore
    const containerHandle: ElementHandle = contextFn ? contextFn.apply(this, args) : this
    // @ts-ignore
    const evaluateFn: EvaluateFn = new Function(
      'container, fnName, ...args',
      delegateFnBodyToExecuteInPage,
    )

    // Convert RegExp to a special format since they don't serialize well
    let argsToForward = args.map(arg => (arg instanceof RegExp ? convertRegExp(arg) : arg))
    // Remove the container from the argsToForward since it's always the first argument
    if (containerHandle === args[0]) {
      argsToForward = argsToForward.slice(1)
    }

    return processHandleFn!({fnName, containerHandle, evaluateFn, argsToForward})
  }
}

export async function getDocument(_page?: Page): Promise<ElementHandle> {
  // @ts-ignore
  const page: Page = _page || this
  const documentHandle = await page.mainFrame().evaluateHandle('document')
  const document = documentHandle.asElement()
  if (!document) throw new Error('Could not find document')
  return document
}

export function wait(
  callback: () => void,
  {timeout = 4500, interval = 50}: {timeout?: number; interval?: number} = {},
): Promise<{}> {
  return waitForExpect(callback, timeout, interval)
}

export const waitFor = wait

export function configure(options: Partial<IConfigureOptions>): void {
  if (!options) {
    return
  }

  const {testIdAttribute} = options

  if (testIdAttribute) {
    delegateFnBodyToExecuteInPage = delegateFnBodyToExecuteInPageInitial.replace(
      /testIdAttribute: (['|"])data-testid(['|"])/g,
      `testIdAttribute: $1${testIdAttribute}$2`,
    )
  }
}

export function getQueriesForElement<T>(
  object: T,
  contextFn?: ContextFn,
): T & IQueryUtils & IScopedQueryUtils {
  const o = object as any
  if (!contextFn) contextFn = () => o

  const functionNames: Array<keyof IQueryUtils> = [
    'queryByPlaceholderText',
    'queryAllByPlaceholderText',
    'getByPlaceholderText',
    'getAllByPlaceholderText',
    'findByPlaceholderText',
    'findAllByPlaceholderText',

    'queryByText',
    'queryAllByText',
    'getByText',
    'getAllByText',
    'findByText',
    'findAllByText',

    'queryByLabelText',
    'queryAllByLabelText',
    'getByLabelText',
    'getAllByLabelText',
    'findByLabelText',
    'findAllByLabelText',

    'queryByAltText',
    'queryAllByAltText',
    'getByAltText',
    'getAllByAltText',
    'findByAltText',
    'findAllByAltText',

    'queryByTestId',
    'queryAllByTestId',
    'getByTestId',
    'getAllByTestId',
    'findByTestId',
    'findAllByTestId',

    'queryByTitle',
    'queryAllByTitle',
    'getByTitle',
    'getAllByTitle',
    'findByTitle',
    'findAllByTitle',

    'queryByRole',
    'queryAllByRole',
    'getByRole',
    'getAllByRole',
    'findByRole',
    'findAllByRole',

    'queryByDisplayValue',
    'queryAllByDisplayValue',
    'getByDisplayValue',
    'getAllByDisplayValue',
    'findByDisplayValue',
    'findAllByDisplayValue',
  ]
  functionNames.forEach(functionName => {
    o[functionName] = createDelegateFor(functionName, contextFn)
  })

  o.getQueriesForElement = () => getQueriesForElement(o, () => o)
  o.getNodeText = createDelegateFor<string>('getNodeText', contextFn, processNodeText)

  return o
}

export const within = getQueriesForElement

// @ts-ignore
export const queries: IQueryUtils = {}
getQueriesForElement(queries, el => el)
