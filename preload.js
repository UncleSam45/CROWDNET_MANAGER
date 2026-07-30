'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crowdnet', Object.freeze({
  loadCredentials: () => ipcRenderer.invoke('credentials:load'),
  authenticate: input => ipcRenderer.invoke('bridge:authenticate', input),
  restore: () => ipcRenderer.invoke('bridge:read'),
  save: payload => ipcRenderer.invoke('bridge:write', payload),
  listServers: () => ipcRenderer.invoke('servers:list'),
  readProjectServer: input => ipcRenderer.invoke('servers:project-read', input),
  writeProjectServer: input => ipcRenderer.invoke('servers:project-write', input),
  matchCompletedPullRequests: projectName => ipcRenderer.invoke('github:match-completed', { projectName }),
  listBridgeIssues: input => ipcRenderer.invoke('github:bridge-issues', input),
  createBridgeIssue: input => ipcRenderer.invoke('github:create-bridge-issue', input),
  updateBridgeIssue: input => ipcRenderer.invoke('github:update-bridge-issue', input),
  uploadDocumentation: input => ipcRenderer.invoke('documentation:upload', input),
  prepareDocumentation: input => ipcRenderer.invoke('documentation:prepare', input),
  deleteDocumentation: input => ipcRenderer.invoke('documentation:delete', input),
}));
