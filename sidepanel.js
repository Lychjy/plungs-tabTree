// Side panel UI logic for TabTree extension

class TabTreeSidePanel {
  constructor() {
    this.workspaces = [];
    this.currentWorkspaceId = null;
    this.stashedSnapshots = [];
    this.settings = {};
    this.currentTabs = [];
    this.tabTree = [];
    this.searchQuery = '';
    this.expandedTabs = new Set();
    this.draggedTab = null;
    this.tabUpdateTimer = null;
    this.lastTabLoadTime = 0;
    
    // Create debounced version of loadCurrentTabs to avoid flashing when tabs update
    this.debouncedLoadCurrentTabs = (...args) => {
      if (this.tabUpdateTimer) {
        clearTimeout(this.tabUpdateTimer);
        
      }
      this.tabUpdateTimer = setTimeout(() => {
        // Only load if it's been at least 1 second since last load
        if (Date.now() - this.lastTabLoadTime >= 1000) {
          this.loadCurrentTabs(...args);
        }
      }, 500);
    };
    
    this.init();
  }

  async init() {
    this.translateUI(); // Translate static labels to Chinese/English dynamically based on locale
    this.setupEventListeners(); // Register listeners FIRST so UI is always responsive
    await this.loadData();
    this.render();
    this.loadCurrentTabs();
  }

  translateUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = TabTreeUtils.getTranslation(key);
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = TabTreeUtils.getTranslation(key);
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = TabTreeUtils.getTranslation(key);
    });
  }

  // Get dynamic browser SVG icon based on User-Agent
  getDefaultBrowserIcon() {
    const ua = navigator.userAgent.toLowerCase();
    const isEdge = ua.includes('edg/');
    
    if (isEdge) {
      // Microsoft Edge Wave Swirl (Geometrically clean and beautiful)
      return `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; margin-right: 2px;">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c2.4 0 4.7-.9 6.4-2.4l-1.4-1.4c-1.3 1.1-3.1 1.8-5 1.8-3.9 0-7-3.1-7-7s3.1-7 7-7c1.9 0 3.7.7 5 1.8l1.4-1.4C16.7 2.9 14.4 2 12 2z" fill="#0078D4"/>
          <path d="M18.4 6.4c-1.3-1.1-3.1-1.8-5-1.8-3.9 0-7 3.1-7 7s3.1 7 7 7c1.9 0 3.7-.7 5-1.8l1.4 1.4C13.1 21.1 2 17.2 2 12S13.1 2.9 18.4 6.4z" fill="#00B0F0"/>
          <circle cx="12" cy="12" r="3.5" fill="#107C10"/>
        </svg>
      `;
    } else {
      // Google Chrome Pinwheel (Perfect 16x16 vector)
      return `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; margin-right: 2px;">
          <circle cx="12" cy="12" r="10" fill="#4285F4"/>
          <path d="M12 2a10 10 0 0 0-8.66 5h8.66l4.33 7.5a10 10 0 0 0 4.33-7.5H12z" fill="#EA4335"/>
          <path d="M12 22a10 10 0 0 0 8.66-5h-8.66l-4.33-7.5a10 10 0 0 0-4.33 7.5H12z" fill="#FBBC05"/>
          <path d="M3.34 7a10 10 0 0 0 0 10l5-8.66L12 12l4.33-7.5H12A10 10 0 0 0 3.34 7z" fill="#34A853"/>
          <circle cx="12" cy="12" r="4" fill="#FFFFFF"/>
          <circle cx="12" cy="12" r="3" fill="#4285F4"/>
        </svg>
      `;
    }
  }

  async loadData() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getData' });
      if (response) {
        this.workspaces = response.workspaces || [];
        this.currentWorkspaceId = response.currentWorkspaceId || null;
        this.stashedSnapshots = response.stashedSnapshots || [];
        this.settings = response.settings || {
          autoCategorize: true,
          enableSync: true,
          showFavicons: true,
          compactMode: false
        };
      } else {
        throw new Error('Empty response from background');
      }
    } catch (e) {
      console.error('Failed to load data, using defaults:', e);
      this.workspaces = [];
      this.currentWorkspaceId = null;
      this.stashedSnapshots = [];
      this.settings = {
        autoCategorize: true,
        enableSync: true,
        showFavicons: true,
        compactMode: false
      };
    }
  }

  setupEventListeners() {
    // Search
    document.getElementById('searchBtn').addEventListener('click', () => this.toggleSearch());
    document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('clearSearch').addEventListener('click', () => this.clearSearch());

    // Workspace actions
    document.getElementById('addWorkspaceBtn').addEventListener('click', () => this.showCreateWorkspaceDialog());

    // Tab tree actions
    document.getElementById('collapseAllBtn').addEventListener('click', () => this.collapseAll());
    document.getElementById('expandAllBtn').addEventListener('click', () => this.expandAll());

    // Stashed actions
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => this.importData());

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => this.toggleSettings());
    document.getElementById('closeSettings').addEventListener('click', () => this.toggleSettings());
    // document.getElementById('minimizeBtn').addEventListener('click', () => this.minimizePanel());
    document.getElementById('floatingBall').addEventListener('click', () => this.expandPanel());

    // Settings checkboxes
    document.getElementById('autoCategorize').addEventListener('change', (e) => this.updateSetting('autoCategorize', e.target.checked));
    document.getElementById('enableSync').addEventListener('change', (e) => this.updateSetting('enableSync', e.target.checked));
    document.getElementById('showFavicons').addEventListener('change', (e) => this.updateSetting('showFavicons', e.target.checked));
    document.getElementById('compactMode').addEventListener('change', (e) => this.updateSetting('compactMode', e.target.checked));

    // Context menu
    document.addEventListener('click', (e) => this.hideContextMenu());
    document.getElementById('contextMenu').addEventListener('click', (e) => this.handleContextMenuAction(e));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message) => this.handleBackgroundMessage(message));
  }

  async loadCurrentTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      this.currentTabs = tabs;
      
      // Enrich current tabs with tags from our stored current workspace
      const currentWorkspace = this.workspaces.find(w => w.id === this.currentWorkspaceId);
      if (currentWorkspace && currentWorkspace.tabs) {
        const storedTabMap = new Map(currentWorkspace.tabs.map(t => [t.id, t]));
        tabs.forEach(tab => {
          const storedTab = storedTabMap.get(tab.id);
          if (storedTab) {
            tab.tag = storedTab.tag;
          }
        });
      }

      // Automatically expand parent path of active tab so it is always visible
      const activeTab = tabs.find(t => t.active);
      if (activeTab) {
        let parentId = activeTab.openerTabId;
        while (parentId) {
          const parentTab = tabs.find(t => t.id === parentId);
          if (parentTab) {
            this.expandedTabs.add(parentId);
            parentId = parentTab.openerTabId;
          } else {
            break;
          }
        }
      }
      
      this.tabTree = TabTreeUtils.buildTabTree(tabs);
      this.renderTabsTree();
      this.lastTabLoadTime = Date.now();
    } catch (e) {
      console.error('Failed to load tabs:', e);
    }
  }

  render() {
    this.renderWorkspaces();
    this.renderTabsTree();
    this.renderStashed();
    this.applySettings();
  }

  renderWorkspaces() {
    const container = document.getElementById('workspaceList');
    container.innerHTML = '';

    this.workspaces.forEach(workspace => {
      const isActive = workspace.id === this.currentWorkspaceId;
      const tabCount = workspace.tabs.length;
      
      const item = document.createElement('div');
      item.className = `workspace-item ${isActive ? 'active' : ''}`;
      item.dataset.workspaceId = workspace.id;
      
      const countText = TabTreeUtils.getLocale() === 'zh' ? `${tabCount} 个标签页` : `${tabCount} tab${tabCount !== 1 ? 's' : ''}`;
      const renameTitle = TabTreeUtils.getTranslation('rename');
      const deleteTitle = TabTreeUtils.getTranslation('delete');
      const displayName = workspace.name === 'Default' ? TabTreeUtils.getTranslation('General') : workspace.name;
      
      item.innerHTML = `
        <div class="workspace-color" style="background: ${TabTreeUtils.getColor(workspace.color)}"></div>
        <div class="workspace-info">
          <div class="workspace-name">${this.escapeHtml(displayName)}</div>
          <div class="workspace-count">${countText}</div>
        </div>
        <div class="workspace-actions">
          <button class="icon-btn" data-action="rename" title="${renameTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="delete" title="${deleteTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
      
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.workspace-actions')) {
          this.switchWorkspace(workspace.id);
        }
      });
      
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, { type: 'workspace', id: workspace.id });
      });
      
      item.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.renameWorkspace(workspace.id);
      });
      
      item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteWorkspace(workspace.id);
      });
      
      container.appendChild(item);
    });
  }

  renderTabsTree() {
    const container = document.getElementById('tabsTree');
    container.innerHTML = '';

    const tabsToRender = this.searchQuery 
      ? TabTreeUtils.searchTabs(TabTreeUtils.flattenTree(this.tabTree), this.searchQuery)
      : this.tabTree;

    if (tabsToRender.length === 0) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${this.escapeHtml(TabTreeUtils.getTranslation('noTabs'))}</div>`;
      return;
    }

    tabsToRender.forEach(tab => {
      this.renderTabNode(tab, container, 0);
    });
  }

  renderTabNode(tab, container, level) {
    const hasChildren = tab.children && tab.children.length > 0;
    const isExpanded = this.expandedTabs.has(tab.id);
    const isAnyVirtual = tab.isVirtualGroup || tab.isVirtualDomainGroup;
    
    const item = document.createElement('div');
    item.className = `tab-item ${tab.active ? 'active' : ''} ${isAnyVirtual ? 'virtual-group' : ''}`;
    item.dataset.tabId = tab.id;
    item.style.paddingLeft = `${12 + level * 20}px`;
    
    // Icon for virtual group or standard favicon
    let faviconHtml = '';
    if (tab.isVirtualGroup) {
      faviconHtml = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-color); flex-shrink: 0; margin-right: 2px;">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    } else if (tab.isVirtualDomainGroup) {
      if (this.settings.showFavicons && tab.favIconUrl) {
        faviconHtml = `<img class="tab-favicon" src="${tab.favIconUrl}" onerror="this.src=''; this.style.display='none'">`;
      } else {
        faviconHtml = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-color); flex-shrink: 0; margin-right: 2px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        `;
      }
    } else if (this.settings.showFavicons && tab.favIconUrl) {
      faviconHtml = `<img class="tab-favicon" src="${tab.favIconUrl}" onerror="this.outerHTML='${this.getDefaultBrowserIcon().replace(/\n/g, '').replace(/'/g, "\\'")}`;
    } else {
      faviconHtml = this.getDefaultBrowserIcon();
    }

    // Display title
    const displayName = isAnyVirtual 
      ? `${tab.title} (${tab.children.length})` 
      : tab.title;

    // Action button for virtual group on the right
    let actionHtml = '';
    if (isAnyVirtual) {
      actionHtml = `
        <button class="icon-btn clear-all-group-btn" data-action="clearAll" title="${TabTreeUtils.getTranslation('close')}" style="padding: 2px; width: 24px; height: 24px; margin-left: auto;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--danger-color);">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `;
    }

    item.innerHTML = `
      <button class="tab-toggle ${hasChildren ? '' : 'hidden'} ${isExpanded ? 'expanded' : ''}" data-tab-id="${tab.id}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      ${faviconHtml}
      <span class="tab-title ${tab.active ? 'active' : ''}">${this.escapeHtml(displayName)}</span>
      ${tab.tag ? `<span class="tab-tag">${this.escapeHtml(TabTreeUtils.getTranslation(tab.tag))}</span>` : ''}
      ${actionHtml}
    `;
    
    if (isAnyVirtual) {
      const clearBtn = item.querySelector('[data-action="clearAll"]');
      clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmMsg = TabTreeUtils.getLocale() === 'zh' 
          ? `确定要关闭所有这 ${tab.children.length} 个标签页吗？` 
          : `Are you sure you want to close all ${tab.children.length} of these tabs?`;
        if (confirm(confirmMsg)) {
          const realTabs = TabTreeUtils.flattenTree(tab.children);
          const childIds = realTabs.map(child => child.id).filter(id => typeof id === 'number');
          await chrome.tabs.remove(childIds);
          await this.loadCurrentTabs();
        }
      });
    } else {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-toggle')) {
          this.activateTab(tab.id);
        }
      });
    }
    
    if (!isAnyVirtual) {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, { type: 'tab', id: tab.id, data: tab });
      });
      
      item.draggable = true;
      item.addEventListener('dragstart', (e) => this.handleDragStart(e, tab));
      item.addEventListener('dragover', (e) => this.handleDragOver(e));
      item.addEventListener('drop', (e) => this.handleDrop(e, tab));
      item.addEventListener('dragend', () => this.handleDragEnd());
    }
    
    const toggle = item.querySelector('.tab-toggle');
    if (hasChildren) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleTabExpansion(tab.id);
      });
    }
    
    container.appendChild(item);
    
    // Render children if expanded
    if (hasChildren && isExpanded) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tab-children';
      tab.children.forEach(child => this.renderTabNode(child, childrenContainer, level + 1));
      container.appendChild(childrenContainer);
    }
  }

  renderStashed() {
    const container = document.getElementById('stashedList');
    container.innerHTML = '';

    if (this.stashedSnapshots.length === 0) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${this.escapeHtml(TabTreeUtils.getTranslation('noStashed'))}</div>`;
      return;
    }

    this.stashedSnapshots.forEach(snapshot => {
      const item = document.createElement('div');
      item.className = 'stashed-item';
      item.dataset.snapshotId = snapshot.id;
      
      const useTitle = TabTreeUtils.getTranslation('useSnapshot');
      const renameTitle = TabTreeUtils.getTranslation('rename');
      const deleteTitle = TabTreeUtils.getTranslation('delete');
      
      item.innerHTML = `
        <div class="stashed-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <div class="stashed-info">
          <div class="stashed-name">${this.escapeHtml(snapshot.name)}</div>
          <div class="stashed-date">${TabTreeUtils.formatDate(snapshot.createdAt)}</div>
        </div>
        <span class="stashed-count">${snapshot.tabs.length}</span>
        <div class="stashed-actions">
          <button class="icon-btn" data-action="use" title="${useTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 10 4 15 9 20"/>
              <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="rename" title="${renameTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="delete" title="${deleteTitle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
      
      // Use snapshot button
      item.querySelector('[data-action="use"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.restoreSnapshot(snapshot.id);
      });
      
      // Rename snapshot button
      item.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.renameSnapshot(snapshot.id);
      });
      
      // Delete snapshot button
      item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSnapshot(snapshot.id);
      });
      
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, { type: 'snapshot', id: snapshot.id });
      });
      
      container.appendChild(item);
    });
  }

  applySettings() {
    document.getElementById('autoCategorize').checked = this.settings.autoCategorize;
    document.getElementById('enableSync').checked = this.settings.enableSync;
    document.getElementById('showFavicons').checked = this.settings.showFavicons;
    document.getElementById('compactMode').checked = this.settings.compactMode;
    
    if (this.settings.compactMode) {
      document.body.classList.add('compact');
    } else {
      document.body.classList.remove('compact');
    }
  }

  // Workspace actions
  async switchWorkspace(workspaceId) {
    try {
      // Cancel any pending tab updates to avoid race conditions
      if (this.tabUpdateTimer) {
        clearTimeout(this.tabUpdateTimer);
        this.tabUpdateTimer = null;
      }
      
      this.currentWorkspaceId = workspaceId;
      await chrome.runtime.sendMessage({ type: 'switchWorkspace', workspaceId });
      await this.loadData();
      // Render workspaces and stashed immediately
      this.renderWorkspaces();
      this.renderStashed();
      this.applySettings();
      // Load tabs immediately without waiting for backend message - this ensures single render
      await this.loadCurrentTabs();
    } catch (e) {
      console.error('Failed to switch workspace:', e);
    }
  }

  showCreateWorkspaceDialog() {
    const name = prompt(TabTreeUtils.getTranslation('enterWorkspaceName'));
    if (name) {
      const colors = ['workspace-blue', 'workspace-green', 'workspace-purple', 'workspace-orange', 'workspace-pink', 'workspace-yellow'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      chrome.runtime.sendMessage({ type: 'createWorkspace', name, color });
    }
  }

  async renameWorkspace(workspaceId) {
    const workspace = this.workspaces.find(w => w.id === workspaceId);
    if (!workspace) return;
    
    const name = prompt(TabTreeUtils.getTranslation('enterNewWorkspaceName'), workspace.name);
    if (name) {
      await chrome.runtime.sendMessage({ type: 'renameWorkspace', workspaceId, name });
      await this.loadData();
      this.renderWorkspaces();
    }
  }

  async deleteWorkspace(workspaceId) {
    if (this.workspaces.length <= 1) {
      alert(TabTreeUtils.getTranslation('cannotDeleteLastWorkspace'));
      return;
    }
    
    if (confirm(TabTreeUtils.getTranslation('confirmDeleteWorkspace'))) {
      await chrome.runtime.sendMessage({ type: 'deleteWorkspace', workspaceId });
      await this.loadData();
      this.renderWorkspaces();
    }
  }

  // Tab actions
  async activateTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (e) {
      console.error('Failed to activate tab:', e);
    }
  }

  toggleTabExpansion(tabId) {
    if (this.expandedTabs.has(tabId)) {
      this.expandedTabs.delete(tabId);
    } else {
      this.expandedTabs.add(tabId);
    }
    this.renderTabsTree();
  }

  collapseAll() {
    this.expandedTabs.clear();
    this.renderTabsTree();
  }

  expandAll() {
    const allTabs = TabTreeUtils.flattenTree(this.tabTree);
    allTabs.forEach(tab => {
      if (tab.children && tab.children.length > 0) {
        this.expandedTabs.add(tab.id);
      }
    });
    this.renderTabsTree();
  }

  // Search
  toggleSearch() {
    const container = document.getElementById('searchContainer');
    container.classList.toggle('hidden');
    if (!container.classList.contains('hidden')) {
      document.getElementById('searchInput').focus();
    }
  }

  handleSearch(query) {
    this.searchQuery = query;
    this.renderTabsTree();
  }

  clearSearch() {
    this.searchQuery = '';
    document.getElementById('searchInput').value = '';
    this.renderTabsTree();
  }

  // Stash actions
  async restoreSnapshot(snapshotId) {
    if (confirm(TabTreeUtils.getTranslation('confirmRestore'))) {
      await chrome.runtime.sendMessage({ type: 'restoreSnapshot', snapshotId });
      await this.loadData();
      this.render();
      this.loadCurrentTabs();
    }
  }

  async renameSnapshot(snapshotId) {
    const snapshot = this.stashedSnapshots.find(s => s.id === snapshotId);
    if (!snapshot) return;
    
    const name = prompt(TabTreeUtils.getTranslation('enterNewWorkspaceName'), snapshot.name);
    if (name && name.trim()) {
      await chrome.runtime.sendMessage({ type: 'renameSnapshot', snapshotId, name: name.trim() });
      await this.loadData();
      this.renderStashed();
    }
  }

  async deleteSnapshot(snapshotId) {
    if (confirm(TabTreeUtils.getTranslation('confirmDeleteSnapshot'))) {
      await chrome.runtime.sendMessage({ type: 'deleteSnapshot', snapshotId });
      await this.loadData();
      this.renderStashed();
    }
  }

  // Settings
  toggleSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.toggle('hidden');
  }

  minimizePanel() {
    // Hide content and show floating ball, make sidepanel appear as 24px strip
    document.body.classList.add('minimized');
  }

  expandPanel() {
    // Show content and hide floating ball, restore normal width
    document.body.classList.remove('minimized');
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    await chrome.runtime.sendMessage({ type: 'updateSettings', settings: this.settings });
    this.applySettings();
  }

  // Export/Import
  exportData() {
    const data = {
      workspaces: this.workspaces,
      currentWorkspaceId: this.currentWorkspaceId,
      stashedSnapshots: this.stashedSnapshots,
      settings: this.settings,
      exportedAt: Date.now()
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabtree-backup-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        await chrome.runtime.sendMessage({ type: 'importData', data: text });
        await this.loadData();
        this.render();
        alert(TabTreeUtils.getTranslation('newDataImported'));
      }
    };
    input.click();
  }

  // Context menu
  showContextMenu(e, context) {
    const menu = document.getElementById('contextMenu');
    menu.classList.remove('hidden');
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.dataset.context = JSON.stringify(context);

    // Show/hide menu items based on context type
    const allItems = menu.querySelectorAll('.menu-item');
    const tabItems = menu.querySelectorAll('.tab-menu-only');
    const snapshotItems = menu.querySelectorAll('.snapshot-menu-only');
    const workspaceItems = menu.querySelectorAll('.workspace-menu-only');
    const dividers = menu.querySelectorAll('.menu-divider');
    
    // Hide all type-specific items first
    tabItems.forEach(el => el.style.display = 'none');
    snapshotItems.forEach(el => el.style.display = 'none');
    workspaceItems.forEach(el => el.style.display = 'none');
    dividers.forEach(el => el.style.display = 'none');

    if (context.type === 'tab') {
      tabItems.forEach(el => el.style.display = '');
      // Show tab-related dividers
      menu.querySelectorAll('.tab-menu-only.menu-divider').forEach(el => el.style.display = '');
      
      // Populate Move to Workspace submenu
      const moveItem = document.getElementById('moveToWorkspaceMenuItem');
      const submenu = document.getElementById('workspaceSubmenu');
      submenu.innerHTML = '';
      
      const otherWorkspaces = this.workspaces.filter(w => w.id !== this.currentWorkspaceId);
      
      if (otherWorkspaces.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'submenu-item';
        emptyItem.style.color = 'var(--text-secondary)';
        emptyItem.style.pointerEvents = 'none';
        emptyItem.textContent = 'No other workspaces';
        submenu.appendChild(emptyItem);
      } else {
        otherWorkspaces.forEach(ws => {
          const subItem = document.createElement('div');
          subItem.className = 'submenu-item';
          subItem.textContent = ws.name;
          subItem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.moveTabToWorkspace(context.id, ws.id);
            this.hideContextMenu();
          });
          submenu.appendChild(subItem);
        });
      }
    } else if (context.type === 'snapshot') {
      snapshotItems.forEach(el => el.style.display = '');
    } else if (context.type === 'workspace') {
      workspaceItems.forEach(el => el.style.display = '');
    }
  }

  async moveTabToWorkspace(tabId, targetWorkspaceId) {
    await chrome.runtime.sendMessage({
      type: 'moveTabToWorkspace',
      tabId: tabId,
      targetWorkspaceId: targetWorkspaceId
    });
  }

  hideContextMenu() {
    document.getElementById('contextMenu').classList.add('hidden');
  }

  async handleContextMenuAction(e) {
    const action = e.target.dataset.action;
    if (!action) return;
    
    const context = JSON.parse(document.getElementById('contextMenu').dataset.context);
    
    switch (action) {
      // Tab actions
      case 'newTab':
        await chrome.tabs.create({});
        break;
      case 'duplicate':
        if (context.type === 'tab') {
          await chrome.tabs.duplicate(context.id);
        }
        break;
      case 'pin':
        if (context.type === 'tab') {
          const tab = await chrome.tabs.get(context.id);
          await chrome.tabs.update(context.id, { pinned: !tab.pinned });
        }
        break;
      case 'close':
        if (context.type === 'tab') {
          await chrome.tabs.remove(context.id);
        }
        break;
      case 'closeOthers':
        if (context.type === 'tab') {
          const tabs = await chrome.tabs.query({});
          await Promise.all(tabs.filter(t => t.id !== context.id).map(t => chrome.tabs.remove(t.id)));
        }
        break;
      case 'closeRight':
        if (context.type === 'tab') {
          const tabs = await chrome.tabs.query({});
          const currentIndex = tabs.findIndex(t => t.id === context.id);
          const tabsToClose = tabs.slice(currentIndex + 1);
          await Promise.all(tabsToClose.map(t => chrome.tabs.remove(t.id)));
        }
        break;
      // Snapshot actions
      case 'useSnapshot':
        if (context.type === 'snapshot') {
          await this.restoreSnapshot(context.id);
        }
        break;
      case 'renameSnapshot':
        if (context.type === 'snapshot') {
          await this.renameSnapshot(context.id);
        }
        break;
      case 'deleteSnapshot':
        if (context.type === 'snapshot') {
          await this.deleteSnapshot(context.id);
        }
        break;
      // Workspace actions
      case 'renameWorkspace':
        if (context.type === 'workspace') {
          await this.renameWorkspace(context.id);
        }
        break;
      case 'deleteWorkspace':
        if (context.type === 'workspace') {
          await this.deleteWorkspace(context.id);
        }
        break;
    }
    
    this.hideContextMenu();
  }

  // Drag and drop
  handleDragStart(e, tab) {
    if (tab.isVirtualGroup) {
      e.preventDefault();
      return;
    }
    this.draggedTab = tab;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async handleDrop(e, targetTab) {
    e.preventDefault();
    if (targetTab.isVirtualGroup) return; // Prevent drops onto virtual group
    if (this.draggedTab && this.draggedTab.id !== targetTab.id) {
      try {
        const targetTabObj = await chrome.tabs.get(targetTab.id);
        await chrome.tabs.move(this.draggedTab.id, { index: targetTabObj.index });
        await this.loadCurrentTabs();
      } catch (err) {
        console.error('Failed to move tab:', err);
      }
    }
  }

  handleDragEnd() {
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('dragging');
    });
    this.draggedTab = null;
  }

  // Keyboard shortcuts
  handleKeyboard(e) {
    if (e.key === 'Escape') {
      this.hideContextMenu();
      const modal = document.getElementById('settingsModal');
      if (!modal.classList.contains('hidden')) {
        this.toggleSettings();
      }
      if (!document.getElementById('searchContainer').classList.contains('hidden')) {
        this.toggleSearch();
      }
    }
    
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      this.toggleSearch();
    }
  }

  // Background message handler
  async handleBackgroundMessage(message) {
    switch (message.type) {
      case 'tabsUpdated':
        this.debouncedLoadCurrentTabs();
        break;
      case 'tabActivated':
        this.debouncedLoadCurrentTabs();
        break;
      case 'workspaceSwitched':
        this.currentWorkspaceId = message.workspaceId;
        this.renderWorkspaces();
        break;
      case 'workspaceCreated':
      case 'workspaceDeleted':
      case 'workspaceRenamed':
        await this.loadData();
        this.renderWorkspaces();
        break;
      case 'workspaceStashed':
        await this.loadData();
        this.renderStashed();
        break;
      case 'snapshotRestored':
        await this.loadData();
        this.renderStashed();
        await this.loadCurrentTabs();
        break;
      case 'snapshotRenamed':
        await this.loadData();
        this.renderStashed();
        break;
      case 'focusSearch':
        this.toggleSearch();
        break;
      case 'dataImported':
        await this.loadData();
        this.render();
        break;
    }
  }

  // Utility
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TabTreeSidePanel();
});
