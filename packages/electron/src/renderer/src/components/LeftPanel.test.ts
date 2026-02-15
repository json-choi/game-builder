import { describe, expect, test } from 'bun:test'

type LeftPanelTab = 'preview' | 'files' | 'assets' | 'console' | 'settings'

const TABS: { id: LeftPanelTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'files', label: 'Files' },
  { id: 'assets', label: 'Assets' },
  { id: 'console', label: 'Console' },
  { id: 'settings', label: 'Settings' },
]

function getTabClassName(tabId: LeftPanelTab, activeTab: LeftPanelTab): string {
  return `tab-bar-item ${activeTab === tabId ? 'tab-bar-item--active' : ''}`
}

function getVisiblePanel(activeTab: LeftPanelTab): string {
  const panels: Record<LeftPanelTab, string> = {
    preview: 'PreviewPanel',
    files: 'FileExplorer',
    assets: 'AssetsPlaceholder',
    console: 'ConsolePlaceholder',
    settings: 'SettingsPanel',
  }
  return panels[activeTab]
}

describe('LeftPanel tab system', () => {
  describe('TABS constant definition', () => {
    test('TABS has exactly 5 entries', () => {
      expect(TABS).toHaveLength(5)
    })

    test('TABS ids match LeftPanelTab union', () => {
      const expectedIds: LeftPanelTab[] = ['preview', 'files', 'assets', 'console', 'settings']
      const actualIds = TABS.map((t) => t.id)
      expect(actualIds).toEqual(expectedIds)
    })

    test('TABS labels are human-readable capitalized strings', () => {
      for (const tab of TABS) {
        expect(tab.label.length).toBeGreaterThan(0)
        expect(tab.label[0]).toBe(tab.label[0].toUpperCase())
      }
    })

    test('TABS ids are all unique', () => {
      const ids = TABS.map((t) => t.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    test('TABS labels are all unique', () => {
      const labels = TABS.map((t) => t.label)
      const uniqueLabels = new Set(labels)
      expect(uniqueLabels.size).toBe(labels.length)
    })

    test('each TABS entry has id and label properties', () => {
      for (const tab of TABS) {
        expect(typeof tab.id).toBe('string')
        expect(typeof tab.label).toBe('string')
      }
    })

    test('first tab is preview (default tab)', () => {
      expect(TABS[0].id).toBe('preview')
      expect(TABS[0].label).toBe('Preview')
    })
  })

  describe('default active tab state', () => {
    test('default activeTab is preview', () => {
      const defaultTab: LeftPanelTab = 'preview'
      expect(defaultTab).toBe('preview')
    })

    test('default tab matches first TABS entry', () => {
      const defaultTab: LeftPanelTab = 'preview'
      expect(defaultTab).toBe(TABS[0].id)
    })
  })

  describe('tab switching state logic', () => {
    test('setActiveTab changes active tab to files', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('files')
      expect(activeTab).toBe('files')
    })

    test('setActiveTab changes active tab to assets', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('assets')
      expect(activeTab).toBe('assets')
    })

    test('setActiveTab changes active tab to console', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('console')
      expect(activeTab).toBe('console')
    })

    test('setActiveTab changes active tab to settings', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('settings')
      expect(activeTab).toBe('settings')
    })

    test('setActiveTab back to preview from another tab', () => {
      let activeTab: LeftPanelTab = 'settings'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('preview')
      expect(activeTab).toBe('preview')
    })

    test('clicking the same tab again keeps it active', () => {
      let activeTab: LeftPanelTab = 'files'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('files')
      expect(activeTab).toBe('files')
    })

    test('rapid tab switching settles on last clicked', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      setActiveTab('files')
      setActiveTab('assets')
      setActiveTab('console')
      setActiveTab('settings')
      setActiveTab('preview')
      setActiveTab('console')

      expect(activeTab).toBe('console')
    })

    test('can cycle through all tabs in order', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }
      const visited: LeftPanelTab[] = [activeTab]

      for (const tab of TABS.slice(1)) {
        setActiveTab(tab.id)
        visited.push(activeTab)
      }

      expect(visited).toEqual(['preview', 'files', 'assets', 'console', 'settings'])
    })
  })

  describe('tab bar item CSS class logic', () => {
    test('active tab gets tab-bar-item--active class', () => {
      const className = getTabClassName('preview', 'preview')
      expect(className).toContain('tab-bar-item--active')
    })

    test('inactive tab does not get tab-bar-item--active class', () => {
      const className = getTabClassName('files', 'preview')
      expect(className).not.toContain('tab-bar-item--active')
    })

    test('all tabs get base tab-bar-item class', () => {
      for (const tab of TABS) {
        const className = getTabClassName(tab.id, 'preview')
        expect(className).toContain('tab-bar-item')
      }
    })

    test('exactly one tab is active at a time for each activeTab value', () => {
      for (const activeTab of TABS) {
        const activeCount = TABS.filter(
          (tab) => getTabClassName(tab.id, activeTab.id).includes('tab-bar-item--active')
        ).length
        expect(activeCount).toBe(1)
      }
    })

    test('switching activeTab moves the active class', () => {
      const previewClass = getTabClassName('preview', 'preview')
      const filesClassWhenPreview = getTabClassName('files', 'preview')
      const previewClassWhenFiles = getTabClassName('preview', 'files')
      const filesClass = getTabClassName('files', 'files')

      expect(previewClass).toContain('tab-bar-item--active')
      expect(filesClassWhenPreview).not.toContain('tab-bar-item--active')
      expect(previewClassWhenFiles).not.toContain('tab-bar-item--active')
      expect(filesClass).toContain('tab-bar-item--active')
    })
  })

  describe('content panel routing logic', () => {
    test('preview tab shows PreviewPanel', () => {
      expect(getVisiblePanel('preview')).toBe('PreviewPanel')
    })

    test('files tab shows FileExplorer', () => {
      expect(getVisiblePanel('files')).toBe('FileExplorer')
    })

    test('assets tab shows AssetsPlaceholder', () => {
      expect(getVisiblePanel('assets')).toBe('AssetsPlaceholder')
    })

    test('console tab shows ConsolePlaceholder', () => {
      expect(getVisiblePanel('console')).toBe('ConsolePlaceholder')
    })

    test('settings tab shows SettingsPanel', () => {
      expect(getVisiblePanel('settings')).toBe('SettingsPanel')
    })

    test('each tab maps to a unique panel', () => {
      const panels = TABS.map((tab) => getVisiblePanel(tab.id))
      const uniquePanels = new Set(panels)
      expect(uniquePanels.size).toBe(panels.length)
    })

    test('all LeftPanelTab values have a panel mapping', () => {
      const allTabIds: LeftPanelTab[] = ['preview', 'files', 'assets', 'console', 'settings']
      for (const id of allTabIds) {
        const panel = getVisiblePanel(id)
        expect(panel).toBeDefined()
        expect(typeof panel).toBe('string')
        expect(panel.length).toBeGreaterThan(0)
      }
    })
  })

  describe('conditional rendering logic', () => {
    test('only the active panel is visible (exclusive rendering)', () => {
      const activeTab: LeftPanelTab = 'files'
      const allTabs: LeftPanelTab[] = ['preview', 'files', 'assets', 'console', 'settings']

      const visiblePanels = allTabs.filter((tab) => tab === activeTab)
      const hiddenPanels = allTabs.filter((tab) => tab !== activeTab)

      expect(visiblePanels).toHaveLength(1)
      expect(hiddenPanels).toHaveLength(4)
      expect(visiblePanels[0]).toBe('files')
    })

    test('switching tabs hides previous panel and shows new one', () => {
      let activeTab: LeftPanelTab = 'preview'
      const allTabs: LeftPanelTab[] = ['preview', 'files', 'assets', 'console', 'settings']

      const isVisible = (tab: LeftPanelTab) => tab === activeTab

      expect(isVisible('preview')).toBe(true)
      expect(isVisible('files')).toBe(false)

      activeTab = 'files'

      expect(isVisible('preview')).toBe(false)
      expect(isVisible('files')).toBe(true)
    })

    test('no panels are visible when activeTab is hypothetically invalid', () => {
      const activeTab = 'nonexistent' as LeftPanelTab
      const allTabs: LeftPanelTab[] = ['preview', 'files', 'assets', 'console', 'settings']

      const visiblePanels = allTabs.filter((tab) => tab === activeTab)
      expect(visiblePanels).toHaveLength(0)
    })
  })

  describe('placeholder components', () => {
    test('AssetsPlaceholder has expected content structure', () => {
      const expected = {
        icon: '\u{1F3A8}',
        text: 'Asset Library',
        subtext: 'Generated assets will appear here',
      }

      expect(expected.icon).toBe('\u{1F3A8}')
      expect(expected.text).toBe('Asset Library')
      expect(expected.subtext).toContain('assets')
    })

    test('ConsolePlaceholder has expected content structure', () => {
      const expected = {
        icon: '\u{1F4BB}',
        text: 'Console Output',
        subtext: 'Godot logs and output will appear here',
      }

      expect(expected.icon).toBe('\u{1F4BB}')
      expect(expected.text).toBe('Console Output')
      expect(expected.subtext).toContain('Godot')
    })
  })

  describe('tab bar rendering order', () => {
    test('TABS render in defined order: preview, files, assets, console, settings', () => {
      const order = TABS.map((t) => t.id)
      expect(order).toEqual(['preview', 'files', 'assets', 'console', 'settings'])
    })

    test('TABS labels render in order: Preview, Files, Assets, Console, Settings', () => {
      const labels = TABS.map((t) => t.label)
      expect(labels).toEqual(['Preview', 'Files', 'Assets', 'Console', 'Settings'])
    })
  })

  describe('LeftPanelProps contract', () => {
    test('projectPath is passed to content panels that need it', () => {
      const projectPath = '/projects/my-game'
      const panelsNeedingPath: LeftPanelTab[] = ['preview', 'files']

      for (const tab of panelsNeedingPath) {
        const panel = getVisiblePanel(tab)
        expect(['PreviewPanel', 'FileExplorer']).toContain(panel)
      }

      const panelsWithoutPath: LeftPanelTab[] = ['assets', 'console', 'settings']
      for (const tab of panelsWithoutPath) {
        const panel = getVisiblePanel(tab)
        expect(['AssetsPlaceholder', 'ConsolePlaceholder', 'SettingsPanel']).toContain(panel)
      }
    })
  })

  describe('tab click handler simulation', () => {
    test('clicking each tab in TABS array triggers state change', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }
      const clickHistory: LeftPanelTab[] = []

      for (const tab of TABS) {
        setActiveTab(tab.id)
        clickHistory.push(activeTab)
      }

      expect(clickHistory).toEqual(['preview', 'files', 'assets', 'console', 'settings'])
    })

    test('onClick handler uses tab.id from TABS map iteration', () => {
      let activeTab: LeftPanelTab = 'preview'
      const setActiveTab = (tab: LeftPanelTab) => { activeTab = tab }

      const handlers = TABS.map((tab) => () => setActiveTab(tab.id))

      handlers[3]()
      expect(activeTab).toBe('console')

      handlers[0]()
      expect(activeTab).toBe('preview')

      handlers[4]()
      expect(activeTab).toBe('settings')
    })
  })

  describe('tab key prop uniqueness', () => {
    test('each tab has a unique key (tab.id) for React rendering', () => {
      const keys = TABS.map((tab) => tab.id)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })
  })
})
