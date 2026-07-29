'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crowdnet', Object.freeze({
  loadCredentials: () => ipcRenderer.invoke('credentials:load'),
  authenticate: input => ipcRenderer.invoke('bridge:authenticate', input),
  restore: () => ipcRenderer.invoke('bridge:read'),
  save: payload => ipcRenderer.invoke('bridge:write', payload),
  matchCompletedPullRequests: projectName => ipcRenderer.invoke('github:match-completed', { projectName }),
}));
