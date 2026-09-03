import packageJson from '../package.json'

const version = packageJson.version

export const manifest: chrome.runtime.ManifestV3 = {
  name: '__MSG_appNameLayerPiP__',
  description: '__MSG_appDesc__',
  author: 'LayerPiP contributors; based on apades/dmMiniPlayer' as any,
  manifest_version: 3,
  version,
  version_name: `LayerPiP ${version}`,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsEX5LjQJRb63yOlR7CeDKjncLBxrk3+ETlQC2miM8dAOCHfyhXBZE1CsIbJwTGJ3SuwAUPQicPofPPAydWM559K24Yfi1HQfPx6J6wwkGSiBDaXyZ8gaSsE70NvjaozsU1eSH1b0oQCSHcCHmPdPCuVfsMPsfaQFYSvgwKkbVlikME7IOpwkfgb5H9amJmFK7n7ogcXoDHudyIWcSdwKaBW60lvWRIP0fOmU8fa6je5K93YEbxUiCtZePCkuA+k9EEipkH2iqlCejnZ0Wa27ovRHWO/r1I0qc/n6FWc4Jb0HMatE13MT3U3gj3sF3q2B582HUrPt6eYE3Y0+jblUBwIDAQAB',
  icons: {
    '16': 'assets/icon16.png',
    '32': 'assets/icon32.png',
    '48': 'assets/icon48.png',
    '64': 'assets/icon64.png',
    '128': 'assets/icon128.png',
  },
  action: {
    default_icon: {
      '16': 'assets/icon16.png',
      '32': 'assets/icon32.png',
      '48': 'assets/icon48.png',
      '64': 'assets/icon64.png',
      '128': 'assets/icon128.png',
    },
    default_popup: 'popup.html',
  },
  host_permissions: ['<all_urls>'],
  permissions: [
    'storage',
    'contextMenus',
    'activeTab',
    // 'tabCapture',
  ],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['entry-init-ext-config.js'],
      run_at: 'document_start',
      matches: ['<all_urls>'],
      all_frames: true,
    },
    {
      js: ['entry-inject-top.js'],
      run_at: 'document_start',
      world: 'MAIN',
      matches: ['<all_urls>'],
    },
    {
      js: ['entry-inject-all-frames-top.js'],
      run_at: 'document_start',
      world: 'MAIN',
      matches: ['<all_urls>'],
      all_frames: true,
    },
    {
      js: ['entry-all-frames.js'],
      run_at: 'document_end',
      matches: ['<all_urls>'],
      all_frames: true,
    },
  ],
  default_locale: 'en',
  web_accessible_resources: [
    {
      resources: ['assets/**/*'],
      matches: ['<all_urls>'],
    },
    {
      resources: ['assets/*'],
      matches: ['<all_urls>'],
    },
  ],
  commands: {
    back: {
      suggested_key: {
        default: 'Alt+Shift+Comma',
        windows: 'Alt+Shift+Comma',
        mac: 'Command+Shift+Left',
      },
      description: '__MSG_back__',
    },
    forward: {
      suggested_key: {
        default: 'Alt+Shift+Period',
        windows: 'Alt+Shift+Period',
        mac: 'Command+Shift+Right',
      },
      description: '__MSG_forward__',
    },
    'pause/play': {
      suggested_key: {
        default: 'Alt+Shift+M',
        windows: 'Alt+Shift+M',
        mac: 'Command+Shift+Space',
      },
      description: '__MSG_playOrPause__',
    },
  },
}
