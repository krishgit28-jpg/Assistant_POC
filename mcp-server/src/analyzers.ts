import type { MCPPayload, SerializedElement } from './types.js'

export interface ContextInsights {
  alignmentIssues: string[]
  contrastIssues: string[]
  fontConsistency: string[]
}

/**
 * Parses a hex color or rgb color and returns relative luminance (0-255).
 * Fallback to 255 (white) if unable to parse.
 */
function getLuminance(colorStr?: string): number {
  if (!colorStr) return 255
  
  let r = 255, g = 255, b = 255
  
  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (hexMatch) {
    r = parseInt(hexMatch[1], 16)
    g = parseInt(hexMatch[2], 16)
    b = parseInt(hexMatch[3], 16)
  } else {
    const hexMatchShort = colorStr.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i)
    if (hexMatchShort) {
      r = parseInt(hexMatchShort[1] + hexMatchShort[1], 16)
      g = parseInt(hexMatchShort[2] + hexMatchShort[2], 16)
      b = parseInt(hexMatchShort[3] + hexMatchShort[3], 16)
    } else {
      const rgbMatch = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i)
      if (rgbMatch) {
        r = parseInt(rgbMatch[1], 10)
        g = parseInt(rgbMatch[2], 10)
        b = parseInt(rgbMatch[3], 10)
      }
    }
  }

  return (0.299 * r + 0.587 * g + 0.114 * b)
}

export function analyzeContext(payload: MCPPayload): ContextInsights {
  const insights: ContextInsights = {
    alignmentIssues: [],
    contrastIssues: [],
    fontConsistency: [],
  }

  const elements = payload.currentSelection || []
  if (elements.length === 0) return insights

  // 1. Alignment Analysis
  // Check if elements are ALMOST aligned (off by 1 to 5 pixels)
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i]
      const b = elements[j]

      // Left alignment
      const leftDiff = Math.abs(a.left - b.left)
      if (leftDiff > 0 && leftDiff <= 5) {
        insights.alignmentIssues.push(`Elements ${a.id} and ${b.id} are nearly left-aligned (off by ${leftDiff}px).`)
      }

      // Top alignment
      const topDiff = Math.abs(a.top - b.top)
      if (topDiff > 0 && topDiff <= 5) {
        insights.alignmentIssues.push(`Elements ${a.id} and ${b.id} are nearly top-aligned (off by ${topDiff}px).`)
      }

      // Center horizontal alignment
      const aCenterX = a.left + a.width / 2
      const bCenterX = b.left + b.width / 2
      const centerHDiff = Math.abs(aCenterX - bCenterX)
      if (centerHDiff > 0 && centerHDiff <= 5) {
        insights.alignmentIssues.push(`Elements ${a.id} and ${b.id} are nearly horizontally centered (off by ${centerHDiff}px).`)
      }
      
      // Center vertical alignment
      const aCenterY = a.top + a.height / 2
      const bCenterY = b.top + b.height / 2
      const centerVDiff = Math.abs(aCenterY - bCenterY)
      if (centerVDiff > 0 && centerVDiff <= 5) {
        insights.alignmentIssues.push(`Elements ${a.id} and ${b.id} are nearly vertically centered (off by ${centerVDiff}px).`)
      }
    }
  }

  // 2. Contrast Analysis
  // Since we don't have the full slide background anymore, we'll assume a white background #ffffff for contrast checks
  // unless we pass background explicitly in the future.
  const bgLuminance = getLuminance('#ffffff')
  
  for (const el of elements) {
    if (el.type === 'text' && el.defaultColor) {
      const textLuminance = getLuminance(el.defaultColor)
      const diff = Math.abs(bgLuminance - textLuminance)
      
      // If luminance difference is less than 60 (out of 255), it's probably hard to read
      if (diff < 60) {
        insights.contrastIssues.push(`Text element ${el.id} has low contrast against a white background. (Text: ${el.defaultColor})`)
      }
    }
  }

  // 3. Font Consistency Analysis
  const textElements = elements.filter(el => el.type === 'text')
  if (textElements.length > 1) {
    const fontsUsed = new Set<string>()
    const sizesUsed = new Set<string>()
    
    for (const el of textElements) {
      if (el.defaultFontName) fontsUsed.add(el.defaultFontName)
      if (el.defaultSize) sizesUsed.add(el.defaultSize)
    }

    if (fontsUsed.size > 2) {
      insights.fontConsistency.push(`Slide uses ${fontsUsed.size} different font families: ${Array.from(fontsUsed).join(', ')}. Consider reducing to 1 or 2 for consistency.`)
    }

    if (sizesUsed.size > 3) {
      insights.fontConsistency.push(`Slide uses ${sizesUsed.size} different font sizes. Consider standardizing them.`)
    }
  }

  return insights
}
