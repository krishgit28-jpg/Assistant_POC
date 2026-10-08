/**
 * Text metrics & rewriting helpers.
 *
 * PPTist stores text as HTML: font sizes live in `<span style="font-size: 18px">`
 * and alignment in `<p style="text-align: center">`. These helpers read those
 * values (for analysis) and rewrite them (for the setFontSize / setTextAlign actions).
 */

const FONT_SIZE_RE = /font-size:\s*(\d+(?:\.\d+)?)px/gi
const TEXT_ALIGN_RE = /text-align:\s*(left|center|right|justify)/gi

export type TextAlignValue = 'left' | 'center' | 'right' | 'justify'

function byFrequency(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

/** Distinct font sizes (px) in the HTML, most frequent first. */
export function extractFontSizes(html: string): number[] {
  const found = [...html.matchAll(FONT_SIZE_RE)].map(m => m[1])
  return byFrequency(found).map(Number)
}

/** Dominant text alignment. PPTist paragraphs default to left when unstyled. */
export function extractTextAlign(html: string): TextAlignValue {
  const found = [...html.matchAll(TEXT_ALIGN_RE)].map(m => m[1].toLowerCase())
  return (byFrequency(found)[0] as TextAlignValue | undefined) ?? 'left'
}

/** Set every font size in the HTML to `size` px; wraps unstyled paragraphs too. */
export function applyFontSize(html: string, size: number): string {
  const px = `font-size: ${size}px`
  let out = html.replace(FONT_SIZE_RE, px)
  // Paragraphs/list items that never had an explicit size get a wrapping span.
  out = out.replace(/<p([^>]*)>((?:(?!<\/p>)[\s\S])*)<\/p>/gi, (full, attrs: string, inner: string) => {
    return /font-size:/i.test(inner) ? full : `<p${attrs}><span style="${px};">${inner}</span></p>`
  })
  // List containers carry a size too (`<ul style="font-size: 18px">`).
  return out
}

/** Set `text-align` on every paragraph in the HTML. */
export function applyTextAlign(html: string, align: TextAlignValue): string {
  return html.replace(/<p((?:\s[^>]*)?)>/gi, (_full, attrs: string) => {
    const styleMatch = attrs.match(/\sstyle="([^"]*)"/i)
    if (!styleMatch) return `<p${attrs} style="text-align: ${align};">`
    const cleaned = styleMatch[1].replace(/text-align:\s*[a-z]+;?\s*/gi, '').trim()
    const style = `${cleaned}${cleaned && !cleaned.endsWith(';') ? ';' : ''}${cleaned ? ' ' : ''}text-align: ${align};`
    return `<p${attrs.replace(styleMatch[0], ` style="${style}"`)}>`
  })
}
