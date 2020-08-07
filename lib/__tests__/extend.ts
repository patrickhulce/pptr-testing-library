import * as path from 'path'
import * as playwright from 'playwright'

describe('lib/extend.ts', () => {
  let browser: playwright.ChromiumBrowser
  let page: playwright.Page
  let document: playwright.ElementHandle

  it('should require without error', async () => {
    await import('../extend')
  })

  it('should launch playwright', async () => {
    browser = await playwright.chromium.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']})
    page = await browser.newPage()
    await page.goto(`file://${path.join(__dirname, 'fixtures/page.html')}`)
  })

  it('should extend playwright ElementHandle', async () => {
    document = await page.getDocument()
    expect(typeof document.queryAllByAltText).toBe('function')
  })

  it('should handle the query* methods', async () => {
    const element = await document.queryByText('Hello h1')
    expect(element).toBeTruthy()
    /* istanbul ignore next */
    expect(await page.evaluate(el => el?.textContent, element)).toEqual('Hello h1')
  })

  it('should use the new v3 methods', async () => {
    const element = await document.queryByRole('presentation')
    expect(element).toBeTruthy()
    /* istanbul ignore next */
    expect(await page.evaluate(el => el?.textContent, element)).toContain('Layout table')
  })

  it('should handle regex matching', async () => {
    const element = await document.queryByText(/HeLlO h(1|7)/i)
    expect(element).toBeTruthy()
    /* istanbul ignore next */
    expect(await page.evaluate(el => el?.textContent, element)).toEqual('Hello h1')
  })

  it('should handle the get* methods', async () => {
    const element = await document.getByTestId('testid-text-input')
    /* istanbul ignore next */
    expect(await page.evaluate(el => el.outerHTML, element)).toMatchSnapshot()
  })

  it('should handle the get* method failures', async () => {
    // Use the scoped element so the pretty HTML snapshot is smaller
    const scope = await document.$('#scoped')

    try {
      await scope!.getByTitle('missing')
      fail() // eslint-disable-line jest/no-jasmine-globals
    } catch (err) {
      err.message = err.message.replace(/(\s*at .*(\n|$))+/gm, '\n    <stack>:X:X')
      expect(err.message).toMatchSnapshot()
    }
  })

  it('should handle the LabelText methods', async () => {
    const element = await document.getByLabelText('Label A')
    /* istanbul ignore next */
    expect(await page.evaluate(el => el.outerHTML, element)).toMatchSnapshot()
  })

  it('should handle the queryAll* methods', async () => {
    const elements = await document.queryAllByText(/Hello/)
    expect(elements).toHaveLength(3)

    const text = await Promise.all([
      page.evaluate(el => el.textContent, elements[0]),
      page.evaluate(el => el.textContent, elements[1]),
      page.evaluate(el => el.textContent, elements[2]),
    ])

    expect(text).toEqual(['Hello h1', 'Hello h2', 'Hello h3'])
  })

  it('should handle the queryAll* methods with a selector', async () => {
    const elements = await document.queryAllByText(/Hello/, {selector: 'h2'})
    expect(elements).toHaveLength(1)

    const text = await page.evaluate(el => el.textContent, elements[0])

    expect(text).toEqual('Hello h2')
  })

  it('should handle the getBy* methods with a selector', async () => {
    const element = await document.getByText(/Hello/, {selector: 'h2'})

    const text = await page.evaluate(el => el.textContent, element)

    expect(text).toEqual('Hello h2')
  })

  it('should scope results to element', async () => {
    const scope = await document.$('#scoped')
    const element = await scope!.queryByText(/Hello/)
    /* istanbul ignore next */
    expect(await page.evaluate(el => el?.textContent, element)).toEqual('Hello h3')
  })

  it('should get text content', async () => {
    const $h3 = await document.$('#scoped h3')
    expect(await $h3!.getNodeText()).toEqual('Hello h3')
  })

  it('should work with destructuring', async () => {
    const {queryByText} = (await document.$('#scoped'))!.getQueriesForElement()
    expect(await queryByText('Hello h1')).toBeFalsy()
    expect(await queryByText('Hello h3')).toBeTruthy()
  })

  afterAll(async () => {
    await browser.close()
  })
})