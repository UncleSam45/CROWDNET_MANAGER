'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const BRIDGE = 'UNCLESAM45/CROWDNET_MANAGER_BRIDGE';
let session = null;
const credentialsPath = () => path.join(app.getPath('userData'), 'credentials.bin');
const cachePath = () => path.join(app.getPath('userData'), 'workspace-cache.json');

function trusted(event) {
  const expected = `file://${path.join(__dirname, 'index.html')}`;
  if (!event.senderFrame.url.startsWith(expected)) throw new Error('Untrusted renderer request.');
}

async function github(endpoint, options = {}) {
  if (!session?.accessKey) throw new Error('Authentication required.');
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${session.accessKey}`,
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `Bridge request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function loadCredentials(event) {
  trusted(event);
  if (!safeStorage.isEncryptionAvailable()) return null;
  try { return JSON.parse(safeStorage.decryptString(await fs.readFile(credentialsPath()))); }
  catch (error) { if (error.code !== 'ENOENT') console.warn('[CrowdNet] Credential restore failed.'); return null; }
}

async function authenticate(event, input) {
  trusted(event);
  const username = String(input?.username || '').trim().slice(0, 80);
  const accessKey = String(input?.accessKey || '').trim();
  if (!username || !accessKey) throw new Error('Username and access key are required.');
  session = { username, accessKey };
  try { await github(`/repos/${BRIDGE}`); } catch (error) { session = null; throw error; }
  if (input.remember) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable.');
    await fs.mkdir(path.dirname(credentialsPath()), { recursive: true });
    await fs.writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify({ username, accessKey })), { mode: 0o600 });
  } else await fs.rm(credentialsPath(), { force: true });
  return { username };
}

async function readWorkspace(event) {
  trusted(event);
  try {
    const file = await github(`/repos/${BRIDGE}/contents/system/workspace.json`);
    const workspace = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    await fs.writeFile(cachePath(), JSON.stringify({ sha: file.sha, workspace }));
    return { workspace, sha: file.sha, source: 'bridge' };
  } catch (error) {
    if (error.status === 404) return { workspace: null, sha: null, source: 'new' };
    try { return { ...JSON.parse(await fs.readFile(cachePath(), 'utf8')), source: 'cache', warning: error.message }; }
    catch { throw error; }
  }
}

async function writeWorkspace(event, payload) {
  trusted(event);
  const body = { message: `CROWDNET: ${payload.summary || 'update workspace'}`, content: Buffer.from(JSON.stringify(payload.workspace, null, 2)).toString('base64') };
  if (payload.sha) body.sha = payload.sha;
  try {
    const result = await github(`/repos/${BRIDGE}/contents/system/workspace.json`, { method: 'PUT', body: JSON.stringify(body) });
    const sha = result.content.sha;
    await fs.writeFile(cachePath(), JSON.stringify({ sha, workspace: payload.workspace }));
    return { sha };
  } catch (error) {
    if (error.status === 409 || error.status === 422) return { conflict: true };
    await fs.writeFile(cachePath(), JSON.stringify({ sha: payload.sha, workspace: payload.workspace, pending: true }));
    throw error;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 900, minHeight: 650, backgroundColor: '#06070c',
    title: 'CROWDNET Manager', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  ipcMain.handle('credentials:load', loadCredentials);
  ipcMain.handle('bridge:authenticate', authenticate);
  ipcMain.handle('bridge:read', readWorkspace);
  ipcMain.handle('bridge:write', writeWorkspace);
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
