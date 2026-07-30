'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crowdnet', Object.freeze({
  loadCredentials: () => ipcRenderer.invoke('credentials:load'),
  authenticate: input => ipcRenderer.invoke('bridge:authenticate', input),
  restore: () => ipcRenderer.invoke('bridge:read'),
  save: payload => ipcRenderer.invoke('bridge:write', payload),
  matchCompletedPullRequests: projectName => ipcRenderer.invoke('github:match-completed', { projectName }),
  listBridgeIssues: () => ipcRenderer.invoke('github:bridge-issues'),
  createBridgeIssue: input => ipcRenderer.invoke('github:create-bridge-issue', input),
  updateBridgeIssue: input => ipcRenderer.invoke('github:update-bridge-issue', input),
  uploadDocumentation: input => ipcRenderer.invoke('documentation:upload', input),
  openDocumentation: input => ipcRenderer.invoke('documentation:open', input),
  deleteDocumentation: input => ipcRenderer.invoke('documentation:delete', input),
}));
