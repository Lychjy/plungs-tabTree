importScripts('utils.js');

let currentWorkspaceId = null;
let isSwitching = false;
let workspaces = [];
let stashedSnapshots = [];
let tabUpdateTimer = null;
let settings = {
  autoCategorize: true,
  enableSync: true,
  showFavicons: true,
  compactMode: false
};

// Load data and handle self-initialization on background script evaluation
async function initialize() {
  await loadData();
  
  // Create default workspace if none exists
  if (workspaces.length === 0) {
    const defaultWorkspace = {
      id: TabTreeUtils.generateId(),
      name: 'Default',
      color: 'workspace-blue',
      tabs: [],
      createdAt: Date.now()
    };
    workspaces.push(defaultWorkspace);
    currentWorkspaceId = defaultWorkspace.id;
    await saveData();
  }
}

const initPromise = initialize();

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('TabTree extension installed');
  await initPromise;
  
  // Set up side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Load data from storage
async function loadData() {
  try {
    const data = await chrome.storage.local.get(['workspaces', 'currentWorkspaceId', 'stashedSnapshots', 'settings']);
    workspaces = data.workspaces || [];
    currentWorkspaceId = data.currentWorkspaceId;
    stashedSnapshots = data.stashedSnapshots || [];
    settings = { ...settings, ...data.settings };
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

// Save data to storage
async function saveData() {
  try {
    await chrome.storage.local.set({
      workspaces,
      currentWorkspaceId,
      stashedSnapshots,
      settings
    });
    
    // Sync to cloud if enabled
    if (settings.enableSync) {
      try {
        await chrome.storage.sync.set({
          workspaces,
          currentWorkspaceId,
          stashedSnapshots
        });
      } catch (e) {
        console.error('Sync failed:', e);
      }
    }
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

// Sync open tabs to the current workspace
async function syncCurrentTabsToWorkspace() {
  await initPromise;
  if (isSwitching) {
    console.log('[TabTree] Ignore sync because switching is in progress');
    return;
  }
  if (!currentWorkspaceId) return;
  const workspace = workspaces.find(w => w.id === currentWorkspaceId);
  if (!workspace) return;

  let currentTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  if (!currentTabs || currentTabs.length === 0) {
    currentTabs = await chrome.tabs.query({ currentWindow: true });
  }
  
  if (!currentTabs || currentTabs.length === 0) {
    console.log('[TabTree] Safeguard triggered: Ignore empty tab sync to prevent wiping workspace');
    return;
  }

  workspace.tabs = currentTabs.map(tab => {
    // Determine category / tag if auto-categorize is enabled
    let tag = undefined;
    if (settings.autoCategorize) {
      const categorization = TabTreeUtils.categorizeTab(tab.url, tab.title);
      tag = categorization.category;
    }
    
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      openerTabId: tab.openerTabId, // Keep tracking parent-child structure!
      tag: tag,
      addedAt: Date.now()
    };
  });
  
  await saveData();
  
  // Debounce the message sending to avoid flashing updates in the UI
  if (tabUpdateTimer) {
    clearTimeout(tabUpdateTimer);
  }
  tabUpdateTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'tabsUpdated' }).catch(() => {});
    tabUpdateTimer = null;
  }, 200);
}

// Handle tab events
chrome.tabs.onCreated.addListener(syncCurrentTabsToWorkspace);
chrome.tabs.onRemoved.addListener(syncCurrentTabsToWorkspace);
chrome.tabs.onUpdated.addListener(syncCurrentTabsToWorkspace);

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
  chrome.runtime.sendMessage({ type: 'tabActivated', tabId: activeInfo.tabId });
});

// Handle command execution
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  switch (command) {
    case 'open-sidepanel':
      await chrome.sidePanel.open();
      break;
      
    case 'toggle-workspace':
      await toggleWorkspace();
      break;
      
    case 'stash-current':
      await stashCurrentWorkspace();
      break;
      
    case 'search-tabs':
      await chrome.sidePanel.open();
      chrome.runtime.sendMessage({ type: 'focusSearch' });
      break;
  }
});

// Toggle between workspaces
async function toggleWorkspace() {
  if (workspaces.length < 2) return;
  
  const currentIndex = workspaces.findIndex(w => w.id === currentWorkspaceId);
  const nextIndex = (currentIndex + 1) % workspaces.length;
  currentWorkspaceId = workspaces[nextIndex].id;
  
  await saveData();
  await switchToWorkspace(currentWorkspaceId);
}

// Switch to a specific workspace
async function switchToWorkspace(workspaceId) {
  const nextWorkspace = workspaces.find(w => w.id === workspaceId);
  if (!nextWorkspace) return;

  if (isSwitching) {
    console.log('[TabTree] Switch already in progress, ignoring re-entrant request');
    return;
  }

  // 1. Sync current tabs to the old workspace one last time to make sure they are saved
  if (currentWorkspaceId) {
    await syncCurrentTabsToWorkspace();
  } else {
    // Fallback: If we had no active workspace, save currently open tabs to Default so we don't close them forever!
    const defaultWorkspace = workspaces.find(w => w.name === 'Default');
    if (defaultWorkspace) {
      const currentTabs = await chrome.tabs.query({ lastFocusedWindow: true });
      defaultWorkspace.tabs = currentTabs.map(tab => {
        let tag = undefined;
        if (settings.autoCategorize) {
          const categorization = TabTreeUtils.categorizeTab(tab.url, tab.title);
          tag = categorization.category;
        }
        return {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          favicon: tab.favIconUrl,
          openerTabId: tab.openerTabId,
          tag: tag,
          addedAt: Date.now()
        };
      });
      await saveData();
    }
  }

  // Lock transitions
  isSwitching = true;

  // Disable tab listeners temporarily during switching to avoid feedback loops!
  chrome.tabs.onCreated.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onRemoved.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onUpdated.removeListener(syncCurrentTabsToWorkspace);

  try {
    // 2. Open first tab of next workspace (or a blank tab) so browser window stays open
    let newTabsToOpen = nextWorkspace.tabs || [];
    let firstTab;
    if (newTabsToOpen.length > 0) {
      firstTab = await chrome.tabs.create({ url: newTabsToOpen[0].url, active: true });
    } else {
      firstTab = await chrome.tabs.create({ active: true });
    }

    // 3. Close all other tabs
    const tabsToClose = await chrome.tabs.query({ currentWindow: true });
    const closePromises = tabsToClose
      .filter(tab => tab.id !== firstTab.id)
      .map(tab => chrome.tabs.remove(tab.id));
    await Promise.all(closePromises);

    // 4. Open the rest of the tabs
    if (newTabsToOpen.length > 1) {
      for (let i = 1; i < newTabsToOpen.length; i++) {
        await chrome.tabs.create({ url: newTabsToOpen[i].url, active: false });
      }
    }

    currentWorkspaceId = workspaceId;
    await saveData();
    chrome.runtime.sendMessage({ type: 'workspaceSwitched', workspaceId });
  } catch (e) {
    console.error('Error switching workspace:', e);
  } finally {
    // Re-enable listeners
    chrome.tabs.onCreated.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onRemoved.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onUpdated.addListener(syncCurrentTabsToWorkspace);
    
    // Unlock transitions
    isSwitching = false;
    
    // Notify frontend to load the new workspace tabs after a small delay
    // This ensures the debounce will capture any lingering tab changes
    setTimeout(() => {
      syncCurrentTabsToWorkspace();
    }, 150);
  }
}

// Stash current workspace
async function stashCurrentWorkspace() {
  const workspace = workspaces.find(w => w.id === currentWorkspaceId);
  if (!workspace) return;
  
  if (isSwitching) return;
  isSwitching = true;

  // Disable tab listeners temporarily during stashing
  chrome.tabs.onCreated.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onRemoved.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onUpdated.removeListener(syncCurrentTabsToWorkspace);

  try {
    // Get current tabs
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    
    // Create snapshot
    const snapshot = {
      id: TabTreeUtils.generateId(),
      name: `${workspace.name} - ${new Date().toLocaleString()}`,
      workspaceId: workspace.id,
      tabs: currentTabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favicon: tab.favIconUrl
      })),
      createdAt: Date.now()
    };
    
    stashedSnapshots.unshift(snapshot);
    
    // Clear tabs in current workspace in storage since they are stashed
    workspace.tabs = [];
    
    // Create a single empty/new tab so browser window stays open
    const blankTab = await chrome.tabs.create({ active: true });
    
    // Close other tabs
    await Promise.all(currentTabs.map(tab => chrome.tabs.remove(tab.id)));
    
    await saveData();
    chrome.runtime.sendMessage({ type: 'workspaceStashed', snapshot });
  } catch (e) {
    console.error('Error stashing workspace:', e);
  } finally {
    // Re-enable listeners
    chrome.tabs.onCreated.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onRemoved.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onUpdated.addListener(syncCurrentTabsToWorkspace);
    
    isSwitching = false;
    await syncCurrentTabsToWorkspace();
  }
}

// Restore stashed snapshot
async function restoreSnapshot(snapshotId) {
  const snapshot = stashedSnapshots.find(s => s.id === snapshotId);
  if (!snapshot) return;

  if (isSwitching) return;
  isSwitching = true;

  // Disable tab listeners temporarily during restore
  chrome.tabs.onCreated.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onRemoved.removeListener(syncCurrentTabsToWorkspace);
  chrome.tabs.onUpdated.removeListener(syncCurrentTabsToWorkspace);

  try {
    // Switch workspace to snapshot's workspace if it exists
    if (snapshot.workspaceId && workspaces.some(w => w.id === snapshot.workspaceId)) {
      currentWorkspaceId = snapshot.workspaceId;
    }

    const workspace = workspaces.find(w => w.id === currentWorkspaceId);
    if (workspace) {
      workspace.tabs = snapshot.tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        addedAt: Date.now()
      }));
    }

    // Open tabs from snapshot
    let firstTab;
    if (snapshot.tabs.length > 0) {
      firstTab = await chrome.tabs.create({ url: snapshot.tabs[0].url, active: true });
    } else {
      firstTab = await chrome.tabs.create({ active: true });
    }

    // Close all other tabs
    const tabsToClose = await chrome.tabs.query({ currentWindow: true });
    const closePromises = tabsToClose
      .filter(tab => tab.id !== firstTab.id)
      .map(tab => chrome.tabs.remove(tab.id));
    await Promise.all(closePromises);

    // Open other tabs
    if (snapshot.tabs.length > 1) {
      for (let i = 1; i < snapshot.tabs.length; i++) {
        await chrome.tabs.create({ url: snapshot.tabs[i].url, active: false });
      }
    }

    // Keep snapshot after restore (reusable)
    await saveData();
    chrome.runtime.sendMessage({ type: 'snapshotRestored', snapshotId });
  } catch (e) {
    console.error('Error restoring snapshot:', e);
  } finally {
    // Re-enable listeners
    chrome.tabs.onCreated.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onRemoved.addListener(syncCurrentTabsToWorkspace);
    chrome.tabs.onUpdated.addListener(syncCurrentTabsToWorkspace);
    
    isSwitching = false;
    await syncCurrentTabsToWorkspace();
  }
}

// Handle messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  
  (async () => {
    await initPromise;
    
    switch (message.type) {
      case 'getData':
        sendResponse({
          workspaces,
          currentWorkspaceId,
          stashedSnapshots,
          settings
        });
        break;
        
      case 'createWorkspace':
        await createWorkspace(message.name, message.color);
        sendResponse({ success: true });
        break;
        
      case 'deleteWorkspace':
        await deleteWorkspace(message.workspaceId);
        sendResponse({ success: true });
        break;
        
      case 'renameWorkspace':
        await renameWorkspace(message.workspaceId, message.name);
        sendResponse({ success: true });
        break;
        
      case 'switchWorkspace':
        await switchToWorkspace(message.workspaceId);
        sendResponse({ success: true });
        break;
        
      case 'updateSettings':
        settings = { ...settings, ...message.settings };
        await saveData();
        sendResponse({ success: true });
        break;
        
      case 'stashWorkspace':
        await stashCurrentWorkspace();
        sendResponse({ success: true });
        break;
        
      case 'restoreSnapshot':
        await restoreSnapshot(message.snapshotId);
        sendResponse({ success: true });
        break;
        
      case 'deleteSnapshot':
        stashedSnapshots = stashedSnapshots.filter(s => s.id !== message.snapshotId);
        await saveData();
        sendResponse({ success: true });
        break;
        
      case 'importData':
        await importData(message.data);
        sendResponse({ success: true });
        break;
        
      case 'renameSnapshot':
        await renameSnapshot(message.snapshotId, message.name);
        sendResponse({ success: true });
        break;
        
      case 'moveTabToWorkspace':
        await moveTabToWorkspace(message.tabId, message.targetWorkspaceId);
        sendResponse({ success: true });
        break;
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Create new workspace
async function createWorkspace(name, color) {
  const workspace = {
    id: TabTreeUtils.generateId(),
    name: name || 'New Workspace',
    color: color || 'workspace-blue',
    tabs: [],
    createdAt: Date.now()
  };
  
  workspaces.push(workspace);
  await saveData();
  chrome.runtime.sendMessage({ type: 'workspaceCreated', workspace });
}

// Delete workspace
async function deleteWorkspace(workspaceId) {
  if (workspaces.length <= 1) return; // Don't delete last workspace
  
  workspaces = workspaces.filter(w => w.id !== workspaceId);
  
  if (currentWorkspaceId === workspaceId) {
    currentWorkspaceId = workspaces[0].id;
  }
  
  await saveData();
  chrome.runtime.sendMessage({ type: 'workspaceDeleted', workspaceId });
}

// Rename workspace
async function renameWorkspace(workspaceId, name) {
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace) {
    workspace.name = name;
    await saveData();
    chrome.runtime.sendMessage({ type: 'workspaceRenamed', workspaceId, name });
  }
}

// Import data as a stashed snapshot
async function importData(jsonString) {
  const data = TabTreeUtils.importFromJSON(jsonString);
  if (!data) return;
  
  // Extract tabs from the imported JSON
  // Supports multiple formats: direct tab array, or workspace.tabs, or full export format
  let tabs = [];
  if (Array.isArray(data)) {
    tabs = data;
  } else if (data.tabs && Array.isArray(data.tabs)) {
    tabs = data.tabs;
  } else if (data.workspaces && data.workspaces.length > 0) {
    // Collect all tabs from all workspaces
    data.workspaces.forEach(ws => {
      if (ws.tabs && Array.isArray(ws.tabs)) {
        tabs = tabs.concat(ws.tabs);
      }
    });
  } else if (data.stashedSnapshots && data.stashedSnapshots.length > 0) {
    // Collect all tabs from all stashed snapshots
    data.stashedSnapshots.forEach(s => {
      if (s.tabs && Array.isArray(s.tabs)) {
        tabs = tabs.concat(s.tabs);
      }
    });
  }
  
  if (tabs.length === 0) return;
  
  // Determine snapshot name: "快照 N" / "Snapshot N"
  const isZh = TabTreeUtils.getLocale() === 'zh';
  const snapshotBaseName = isZh ? '快照' : 'Snapshot';
  const existingCount = stashedSnapshots.filter(s => s.name.startsWith(snapshotBaseName)).length;
  
  // Try to use original name from data if available
  let snapshotName;
  if (data.name && typeof data.name === 'string') {
    snapshotName = data.name;
  } else {
    snapshotName = `${snapshotBaseName} ${existingCount + 1}`;
  }
  
  // Normalize tabs: ensure each tab has url, title, favicon
  const normalizedTabs = tabs.map(tab => ({
    url: tab.url || '',
    title: tab.title || tab.url || '',
    favicon: tab.favicon || tab.favIconUrl || ''
  }));
  
  const snapshot = {
    id: TabTreeUtils.generateId(),
    name: snapshotName,
    tabs: normalizedTabs,
    createdAt: Date.now()
  };
  
  stashedSnapshots.unshift(snapshot);
  
  await saveData();
  chrome.runtime.sendMessage({ type: 'dataImported', snapshotId: snapshot.id });
}

// Rename snapshot
async function renameSnapshot(snapshotId, name) {
  const snapshot = stashedSnapshots.find(s => s.id === snapshotId);
  if (snapshot) {
    snapshot.name = name;
    await saveData();
    chrome.runtime.sendMessage({ type: 'snapshotRenamed', snapshotId, name });
  }
}

// Move a tab to a target workspace
async function moveTabToWorkspace(tabId, targetWorkspaceId) {
  const targetWorkspace = workspaces.find(w => w.id === targetWorkspaceId);
  if (!targetWorkspace) return;

  try {
    const tabObj = await chrome.tabs.get(tabId);
    
    // Add to target workspace in storage
    targetWorkspace.tabs.push({
      id: TabTreeUtils.generateId(), // Generate new offline ID for saved tab list
      url: tabObj.url,
      title: tabObj.title,
      favicon: tabObj.favIconUrl,
      addedAt: Date.now()
    });

    // Close the tab in the active browser window
    await chrome.tabs.remove(tabId);
    
    await saveData();
  } catch (e) {
    console.error('Failed to move tab to workspace:', e);
  }
}
