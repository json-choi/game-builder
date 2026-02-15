import { createSession, sendPrompt } from '../opencode/client'
import { getDefaultModel } from '../opencode/config'
import { VISION_AGENT_SYSTEM_PROMPT } from './system-prompt'

export interface ImageAttachment {
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  data: string // base64-encoded image data
}

export type VisionCategory = 'screenshot-bug' | 'ui-ux' | 'asset-quality' | 'visual-consistency'
export type VisionSeverity = 'critical' | 'warning' | 'suggestion'
export type VisionQuality = 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK' | 'POOR' | 'UNKNOWN'

export interface VisionFinding {
  category: VisionCategory
  severity: VisionSeverity
  location: string
  issue: string
  recommendation: string
}

export interface VisionResult {
  overview: string
  findings: VisionFinding[]
  quality: VisionQuality
  raw: string
  success: boolean
}

export class VisionAgent {
  private sessionId: string | null = null

  async analyze(
    images: ImageAttachment[],
    context?: string,
    analysisType?: 'screenshot' | 'ui-ux' | 'asset'
  ): Promise<VisionResult> {
    if (!this.sessionId) {
      const session = await createSession('Vision')
      this.sessionId = session.id
    }

    const typeInstruction = analysisType
      ? `Focus your analysis on: ${analysisType === 'screenshot' ? 'game screenshot analysis' : analysisType === 'ui-ux' ? 'UI/UX feedback' : 'asset quality review'}`
      : 'Perform a comprehensive analysis covering all categories.'

    const fullPrompt = [
      VISION_AGENT_SYSTEM_PROMPT,
      '---',
      typeInstruction,
      context ? `Additional context:\n${context}` : '',
      '',
      `Analyze the ${images.length} attached image${images.length > 1 ? 's' : ''}.`,
    ].join('\n\n')

    const model = getDefaultModel()
    const response = await sendPrompt({
      sessionId: this.sessionId,
      text: fullPrompt,
      model,
      attachments: images,
    })

    const raw = response.text || ''
    return this.parseResponse(raw)
  }

  private parseResponse(raw: string): VisionResult {
    let quality: VisionQuality = 'UNKNOWN'

    if (raw.includes('EXCELLENT')) quality = 'EXCELLENT'
    else if (raw.includes('GOOD')) quality = 'GOOD'
    else if (raw.includes('NEEDS_WORK')) quality = 'NEEDS_WORK'
    else if (raw.includes('POOR')) quality = 'POOR'

    // Extract overview section
    const overviewMatch = raw.match(/### Overview\n([\s\S]*?)(?=###|$)/)
    const overview = overviewMatch ? overviewMatch[1].trim() : ''

    // Extract findings
    const findings = this.parseFindings(raw)

    return {
      overview,
      findings,
      quality,
      raw,
      success: quality !== 'POOR',
    }
  }

  private parseFindings(raw: string): VisionFinding[] {
    const findings: VisionFinding[] = []
    const findingsSection = raw.match(/### Findings\n([\s\S]*?)(?=### Summary|$)/)
    if (!findingsSection) return findings

    const blocks = findingsSection[1].split(/\n(?=- \*\*Category\*\*:)/)
    for (const block of blocks) {
      const category = this.extractField(block, 'Category') as VisionCategory | null
      const severity = this.extractField(block, 'Severity') as VisionSeverity | null
      const location = this.extractField(block, 'Location')
      const issue = this.extractField(block, 'Issue')
      const recommendation = this.extractField(block, 'Recommendation')

      if (category && severity && issue) {
        findings.push({
          category,
          severity,
          location: location || 'unknown',
          issue,
          recommendation: recommendation || '',
        })
      }
    }

    return findings
  }

  private extractField(block: string, fieldName: string): string | null {
    const regex = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+)`)
    const match = block.match(regex)
    return match ? match[1].trim() : null
  }
}
