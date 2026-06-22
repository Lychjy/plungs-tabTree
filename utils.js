// Utility functions for TabTree extension

class TabTreeUtils {
  // Generate unique ID
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Extract domain from URL
  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return url;
    }
  }

  // Extract main domain (e.g. blog.csdn.net -> csdn.net)
  static extractMainDomain(url) {
    const hostname = this.extractDomain(url);
    const parts = hostname.split('.');
    if (parts.length > 2) {
      // Handle co.uk, com.cn etc. if needed, but for standard domains:
      const secondLevel = parts[parts.length - 2];
      const tld = parts[parts.length - 1];
      // Special check for common double-barrelled TLDs like com.cn / net.cn
      if (['com', 'net', 'org', 'gov', 'edu', 'co'].includes(secondLevel) && parts.length > 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return hostname;
  }

  // Categorize tab based on domain
  static categorizeTab(url, title) {
    const domain = this.extractDomain(url);
    const lowerDomain = domain.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Development
    if (lowerDomain.includes('github') || 
        lowerDomain.includes('stackoverflow') ||
        lowerDomain.includes('gitlab') ||
        lowerDomain.includes('bitbucket') ||
        lowerDomain.includes('devdocs') ||
        lowerDomain.includes('mdn') ||
        lowerTitle.includes('api') ||
        lowerTitle.includes('documentation')) {
      return { category: 'Development', color: 'workspace-purple' };
    }

    // Social
    if (lowerDomain.includes('twitter') || 
        lowerDomain.includes('facebook') ||
        lowerDomain.includes('linkedin') ||
        lowerDomain.includes('instagram') ||
        lowerDomain.includes('reddit')) {
      return { category: 'Social', color: 'workspace-blue' };
    }

    // Shopping
    if (lowerDomain.includes('amazon') || 
        lowerDomain.includes('ebay') ||
        lowerDomain.includes('shopify') ||
        lowerDomain.includes('etsy') ||
        lowerTitle.includes('shop') ||
        lowerTitle.includes('buy') ||
        lowerTitle.includes('cart')) {
      return { category: 'Shopping', color: 'workspace-orange' };
    }

    // Entertainment
    if (lowerDomain.includes('youtube') || 
        lowerDomain.includes('netflix') ||
        lowerDomain.includes('twitch') ||
        lowerDomain.includes('spotify') ||
        lowerTitle.includes('video') ||
        lowerTitle.includes('music') ||
        lowerTitle.includes('game')) {
      return { category: 'Entertainment', color: 'workspace-pink' };
    }

    // News
    if (lowerDomain.includes('news') || 
        lowerDomain.includes('cnn') ||
        lowerDomain.includes('bbc') ||
        lowerDomain.includes('nytimes') ||
        lowerTitle.includes('news')) {
      return { category: 'News', color: 'workspace-yellow' };
    }

    // Productivity/Work
    if (lowerDomain.includes('docs.google') || 
        lowerDomain.includes('notion') ||
        lowerDomain.includes('trello') ||
        lowerDomain.includes('asana') ||
        lowerDomain.includes('slack') ||
        lowerDomain.includes('office') ||
        lowerDomain.includes('outlook')) {
      return { category: 'Work', color: 'workspace-green' };
    }

    // Default
    return { category: 'General', color: 'workspace-blue' };
  }

  // Build tree structure from tabs
  static buildTabTree(tabs) {
    const tabMap = new Map();
    const rootTabs = [];

    // Initialize all tabs
    tabs.forEach(tab => {
      tabMap.set(tab.id, {
        ...tab,
        children: [],
        parentId: null,
        level: 0
      });
    });

    // Build parent-child relationships
    tabs.forEach(tab => {
      const tabNode = tabMap.get(tab.id);
      
      // Try to find parent by checking openerTabId
      if (tab.openerTabId && tabMap.has(tab.openerTabId)) {
        const parent = tabMap.get(tab.openerTabId);
        parent.children.push(tabNode);
        tabNode.parentId = tab.openerTabId;
        tabNode.level = parent.level + 1;
      } else {
        rootTabs.push(tabNode);
      }
    });

    // 1. Automatically group "New Tab" pages if there are 2 or more
    const newTabNodes = rootTabs.filter(node => {
      const url = node.url || '';
      const title = node.title || '';
      return url.startsWith('chrome://newtab') || 
             url.startsWith('edge://newtab') || 
             url === 'about:blank' || 
             title === '新标签页' || 
             title === 'New Tab';
    });

    let currentRoots = rootTabs;
    if (newTabNodes.length >= 2) {
      const virtualNewTabsNode = {
        id: 'virtual-new-tabs-group',
        title: this.getTranslation('newTabsGroup'),
        url: '',
        favIconUrl: '',
        children: newTabNodes.map(node => {
          node.parentId = 'virtual-new-tabs-group';
          node.level = 1;
          return node;
        }),
        isVirtualGroup: true,
        level: 0,
        active: newTabNodes.some(n => n.active)
      };

      const newTabIds = new Set(newTabNodes.map(n => n.id));
      currentRoots = rootTabs.filter(node => !newTabIds.has(node.id));
      currentRoots.push(virtualNewTabsNode);
    }

    // 2. Automatically group standard web pages by domain if there are 3 or more root tabs of that domain
    const domainGroups = new Map();
    currentRoots.forEach(node => {
      if (node.isVirtualGroup) return; // Skip the virtual new tabs folder
      
      const url = node.url || '';
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return; // Skip internal pages
      
      const mainDomain = TabTreeUtils.extractMainDomain(url);
      if (!mainDomain || mainDomain.includes(' ') || !mainDomain.includes('.')) return; // Skip invalid hostnames
      
      if (!domainGroups.has(mainDomain)) {
        domainGroups.set(mainDomain, []);
      }
      domainGroups.get(mainDomain).push(node);
    });

    const finalRoots = [];
    const groupedIds = new Set();

    domainGroups.forEach((nodes, domain) => {
      if (nodes.length >= 2) {
        const virtualDomainNode = {
          id: `virtual-domain-group-${domain}`,
          title: domain,
          url: '',
          favIconUrl: nodes[0].favIconUrl || nodes[0].favicon, // Use first child's favicon
          children: nodes.map(node => {
            node.parentId = `virtual-domain-group-${domain}`;
            node.level = node.level + 1; // Increment levels recursively
            return node;
          }),
          isVirtualDomainGroup: true,
          level: 0,
          active: nodes.some(n => n.active)
        };
        finalRoots.push(virtualDomainNode);
        nodes.forEach(n => groupedIds.add(n.id));
      }
    });

    // Add ungrouped roots
    currentRoots.forEach(node => {
      if (!groupedIds.has(node.id)) {
        finalRoots.push(node);
      }
    });

    return finalRoots;
  }

  // Flatten tree for search
  static flattenTree(treeNodes) {
    const result = [];
    
    function traverse(node) {
      result.push(node);
      node.children.forEach(child => traverse(child));
    }
    
    treeNodes.forEach(node => traverse(node));
    return result;
  }

  // Search tabs
  static searchTabs(tabs, query) {
    if (!query) return tabs;
    
    const lowerQuery = query.toLowerCase();
    return tabs.filter(tab => 
      tab.title.toLowerCase().includes(lowerQuery) ||
      tab.url.toLowerCase().includes(lowerQuery)
    );
  }

  // Format date
  static formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  }

  // Debounce function
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Virtual list calculation
  static getVisibleItems(items, scrollTop, itemHeight, containerHeight) {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length
    );
    
    return {
      visibleItems: items.slice(startIndex, endIndex),
      offsetY: startIndex * itemHeight,
      totalHeight: items.length * itemHeight
    };
  }

  // Export data to JSON
  static exportToJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  // Import data from JSON
  static importFromJSON(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return null;
    }
  }

  static getLocale() {
    const lang = typeof navigator !== 'undefined' ? (navigator.language || 'en') : 'en';
    return lang.startsWith('zh') ? 'zh' : 'en';
  }

  static getTranslation(key) {
    const isZh = this.getLocale() === 'zh';
    const translations = {
      zh: {
        workspaces: '工作区',
        currentTabs: '当前标签页',
        stashed: '已保存快照',
        collapse: '折叠',
        expand: '展开',
        export: '导出',
        import: '导入',
        searchPlaceholder: '搜索标签页和工作区...',
        settingsTitle: '设置',
        settingAutoCategorize: '自动为标签页归类打标签',
        settingEnableSync: '启用跨设备多端同步',
        settingShowFavicons: '显示网站图标 (Favicon)',
        settingCompactMode: '紧凑模式',
        noTabs: '暂无标签页',
        noStashed: '暂无已冻结快照',
        confirmRestore: '确定要恢复此快照吗？当前打开的标签页将会被保存并关闭。',
        confirmDeleteSnapshot: '确定要删除此快照吗？',
        confirmDeleteWorkspace: '确定要删除此工作区吗？',
        cannotDeleteLastWorkspace: '不能删除最后一个工作区',
        enterWorkspaceName: '请输入工作区名称：',
        enterNewWorkspaceName: '请输入新的工作区名称：',
        rename: '重命名',
        delete: '删除',
        moveTabTo: '移动到工作区',
        newTab: '新建标签页',
        newTabsGroup: '新标签页合集',
        duplicate: '复制标签页',
        pin: '固定/取消固定',
        close: '关闭标签页',
        closeOthers: '关闭其他标签页',
        closeRight: '关闭右侧标签页',
        noOtherWorkspaces: '无其他工作区',
        newDataImported: '数据导入成功',
        minimizePanel: '收起侧边栏',
        // Categories
        'Development': '开发',
        'Social': '社交',
        'Shopping': '购物',
        'Entertainment': '娱乐',
        'News': '资讯',
        'Work': '工作',
        'General': '常规'
      },
      en: {
        workspaces: 'Workspaces',
        currentTabs: 'Current Tabs',
        stashed: 'Stashed',
        collapse: 'Collapse',
        expand: 'Expand',
        export: 'Export',
        import: 'Import',
        searchPlaceholder: 'Search tabs and workspaces...',
        settingsTitle: 'Settings',
        settingAutoCategorize: 'Auto-categorize tabs by domain',
        settingEnableSync: 'Enable cross-device sync',
        settingShowFavicons: 'Show favicons',
        settingCompactMode: 'Compact mode',
        noTabs: 'No tabs',
        noStashed: 'No stashed snapshots',
        confirmRestore: 'Restore this snapshot? Current tabs will be saved and closed.',
        confirmDeleteSnapshot: 'Delete this snapshot?',
        confirmDeleteWorkspace: 'Delete this workspace?',
        cannotDeleteLastWorkspace: 'Cannot delete the last workspace',
        enterWorkspaceName: 'Enter workspace name:',
        enterNewWorkspaceName: 'Enter new name:',
        rename: 'Rename',
        delete: 'Delete',
        moveTabTo: 'Move to Workspace',
        newTab: 'New Tab',
        newTabsGroup: 'New Tabs Group',
        duplicate: 'Duplicate',
        pin: 'Pin/Unpin',
        close: 'Close',
        closeOthers: 'Close Others',
        closeRight: 'Close to Right',
        noOtherWorkspaces: 'No other workspaces',
        newDataImported: 'Data imported successfully',
        minimizePanel: 'Minimize Side Panel',
        // Categories
        'Development': 'Development',
        'Social': 'Social',
        'Shopping': 'Shopping',
        'Entertainment': 'Entertainment',
        'News': 'News',
        'Work': 'Work',
        'General': 'General'
      }
    };
    return translations[isZh ? 'zh' : 'en'][key] || key;
  }

  // Color palette
  static colors = {
    'workspace-blue': '#0078d4',
    'workspace-green': '#107c10',
    'workspace-purple': '#5c2d91',
    'workspace-orange': '#d83b01',
    'workspace-pink': '#e81123',
    'workspace-yellow': '#ffb900'
  };

  // Get color value
  static getColor(colorName) {
    return this.colors[colorName] || this.colors['workspace-blue'];
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabTreeUtils;
}
