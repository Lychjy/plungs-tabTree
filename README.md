# TabTree - Workspace Tab Manager

A powerful browser extension for Edge and Chrome that helps you organize tabs into workspaces with tree view, auto-categorization, and smart management features.

## Features

### 🗂️ Workspace Management
- **Multi-dimensional Workspaces**: Create custom workspaces (e.g., Work, Learning, Shopping)
- **Auto-categorization**: Automatically categorize tabs based on domain detection (Development, Social, Shopping, Entertainment, News, Work)
- **Color Coding**: Each workspace has a unique color for visual identification
- **Quick Switching**: Instantly switch between workspaces with keyboard shortcuts

### 🌳 Tree View
- **Parent-Child Relationships**: Tabs opened from other pages automatically become child nodes
- **Collapse/Expand**: Hide or show tab branches to reduce visual clutter
- **Visual Hierarchy**: Clear indentation shows tab relationships

### 💾 Stash & Restore
- **One-click Stash**: Save all tabs in a workspace as a snapshot (frees memory)
- **Instant Restore**: Restore entire workspaces with a single click
- **Snapshot History**: Keep multiple stashed snapshots for later use

### 🔍 Search & Filter
- **Global Search**: Search across all tabs and workspaces with keyboard shortcut
- **Quick Filter**: Instantly filter tabs by title or URL
- **Keyboard-driven**: Full keyboard support for power users

### 🔄 Cross-Device Sync
- **Cloud Sync**: Seamlessly sync workspaces across devices using chrome.storage.sync
- **Data Backup**: Export/import workspaces as JSON for backup

### ⌨️ Keyboard Shortcuts
- `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`) - Open TabTree Side Panel
- `Ctrl+Shift+W` (Mac: `Cmd+Shift+W`) - Toggle between workspaces
- `Ctrl+Shift+S` (Mac: `Cmd+Shift+S`) - Stash current workspace
- `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`) - Search all tabs
- `Ctrl+F` - Toggle search in side panel
- `Escape` - Close modals/menus

## Installation

### For Chrome/Edge (Developer Mode)

1. **Download or clone this repository**
   ```bash
   git clone <repository-url>
   cd plungs
   ```

2. **Open the Extensions page**
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the extension**
   - Click "Load unpacked"
   - Select the `plungs` folder

5. **Pin the extension** (optional)
   - Click the puzzle piece icon in the toolbar
   - Pin TabTree for quick access

### For Chrome/Edge (Production)

To publish to the Chrome Web Store or Microsoft Edge Add-ons:

1. Create proper icon files (16x16, 48x48, 128x128 PNG)
2. Update the `manifest.json` with your extension ID
3. Package the extension as a ZIP file
4. Submit to the respective store with a $5 developer fee

## Usage

### Creating Workspaces

1. Click the TabTree icon in your browser toolbar
2. In the side panel, click the "+" button next to "Workspaces"
3. Enter a name for your workspace
4. A random color will be assigned (can be customized in code)

### Switching Workspaces

- **Click** on a workspace in the side panel
- **Use keyboard shortcut**: `Ctrl+Shift+W` to cycle through workspaces
- Current tabs will be closed and workspace tabs will be restored

### Managing Tabs

- **Tree View**: Tabs opened from other pages appear as children
- **Collapse/Expand**: Click the arrow icon to show/hide child tabs
- **Context Menu**: Right-click tabs for options (duplicate, pin, close, etc.)
- **Drag & Drop**: Drag tabs to reorder (basic implementation)

### Stashing Workspaces

1. Open the workspace you want to stash
2. Click the "Stash" button or use `Ctrl+Shift+S`
3. All tabs will be closed and saved as a snapshot
4. Click on a stashed snapshot to restore it

### Searching Tabs

1. Click the search icon or press `Ctrl+Shift+F`
2. Type your search query
3. Results filter in real-time across all tabs
4. Click a result to activate that tab

### Exporting/Importing Data

1. Open the side panel
2. Click "Export" in the Stashed section to download a JSON backup
3. Click "Import" to restore from a JSON file

## Settings

Access settings by clicking the gear icon in the side panel:

- **Auto-categorize tabs by domain**: Automatically assign tabs to workspaces based on URL
- **Enable cross-device sync**: Sync workspaces across your devices
- **Show favicons**: Display website icons in the tab list
- **Compact mode**: Reduce spacing for a more compact view

## Project Structure

```
plungs/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (background script)
├── sidepanel.html         # Side panel UI structure
├── sidepanel.css          # Side panel styling
├── sidepanel.js           # Side panel logic
├── utils.js               # Utility functions
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

## Technical Details

### Auto-categorization Rules

The extension uses domain-based heuristics to categorize tabs:

- **Development**: GitHub, StackOverflow, GitLab, MDN, API docs
- **Social**: Twitter, Facebook, LinkedIn, Instagram, Reddit
- **Shopping**: Amazon, eBay, Shopify, Etsy
- **Entertainment**: YouTube, Netflix, Twitch, Spotify
- **News**: News sites, CNN, BBC, NYTimes
- **Work**: Google Docs, Notion, Trello, Slack, Office
- **General**: Default category for uncategorized sites

### Data Storage

- **Local Storage**: Workspaces, settings, and snapshots stored in `chrome.storage.local`
- **Sync Storage**: Workspaces synced to `chrome.storage.sync` (if enabled)
- **Capacity**: Local storage ~5MB, Sync storage ~100KB (syncs only workspaces, not full snapshots)

### Performance

- **Virtual List**: Only renders visible items in the tab tree (foundation implemented)
- **Lazy Loading**: Tabs loaded on demand
- **Efficient Updates**: Uses message passing to minimize overhead

## Browser Compatibility

- ✅ Chrome 114+ (Side Panel API)
- ✅ Edge 114+ (Side Panel API)
- ❌ Firefox (Side Panel API not yet supported)

## Development

### Building Icons

Replace the placeholder PNG files in the `icons/` folder with actual icons:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

Use a tool like Figma, Photoshop, or online icon generators.

### Modifying Categories

Edit the `categorizeTab` function in `utils.js` to add or modify categorization rules.

### Adding Keyboard Shortcuts

Edit the `commands` section in `manifest.json` and add handlers in `background.js`.

## Troubleshooting

### Extension not loading
- Ensure Developer Mode is enabled
- Check that all files are in the correct directory
- Look for errors in the Extensions page

### Side Panel not opening
- Verify you're using Chrome 114+ or Edge 114+
- Check that the Side Panel API is enabled in your browser

### Sync not working
- Ensure you're signed into your Google/Microsoft account
- Check that sync is enabled in browser settings
- Note: chrome.storage.sync has size limits (~100KB)

### Tabs not auto-categorizing
- Check that "Auto-categorize tabs by domain" is enabled in settings
- Verify the domain rules in `utils.js` match your websites

## Future Enhancements

Potential features for future versions:

- [ ] AI-powered categorization using local ML models
- [ ] Tab groups integration with browser native tab groups
- [ ] Workspace templates
- [ ] Statistics and usage analytics
- [ ] Dark mode theme
- [ ] Custom keyboard shortcuts
- [ ] Tab session history
- [ ] Collaborative workspaces

## License

This project is open source and available for personal and commercial use.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Support

For issues or questions, please open an issue on the repository.

---

**TabTree** - Organize your browsing, boost your productivity.
