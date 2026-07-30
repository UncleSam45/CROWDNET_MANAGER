'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const BRIDGE = 'UNCLESAM45/CROWDNET_MANAGER_BRIDGE';
let session = null;
const trustedWebContents = new Set();
const credentialsPath = () => path.join(app.getPath('userData'), 'credentials.bin');
const cachePath = () => path.join(app.getPath('userData'), 'workspace-cache.json');

function trusted(event) {
  // Do not compare file:// URL strings here. Electron normalizes file URLs
  // differently across platforms (notably Windows drive letters), and the
  // sender frame URL may not yet be populated when preload invokes IPC.
  // BrowserWindow's WebContents identity is stable and cannot be forged by
  // renderer code, so only windows created and registered below may use IPC.
  if (!event?.sender || !trustedWebContents.has(event.sender.id)) {
    throw new Error('Untrusted renderer request.');
  }
  if (event.senderFrame && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Subframe bridge requests are not permitted.');
  }
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

async function findRepositoryByName(projectName) {
  const wanted = projectName.toLocaleLowerCase('en-US');
  for (let page = 1; page <= 10; page++) {
    const repositories = await github(`/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`);
    const match = repositories.find(repository => repository.name.toLocaleLowerCase('en-US') === wanted);
    if (match) return match;
    if (repositories.length < 100) break;
  }
  return null;
}

async function matchCompletedPullRequests(event, input) {
  trusted(event);
  const projectName = String(input?.projectName || '').trim().slice(0, 100);
  if (!projectName) throw new Error('A project name is required for GitHub matching.');
  const repository = await findRepositoryByName(projectName);
  if (!repository) return { matched: false, pullRequests: [] };
  const pullRequests = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await github(`/repos/${repository.full_name}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    pullRequests.push(...batch.map(pull => ({
      number: pull.number, title: pull.title, body: pull.body || '', url: pull.html_url,
      author: pull.user?.login || 'GitHub contributor', createdAt: pull.created_at,
      closedAt: pull.closed_at, mergedAt: pull.merged_at,
    })));
    if (batch.length < 100) break;
  }
  return {
    matched: true,
    repository: { name: repository.name, fullName: repository.full_name, url: repository.html_url },
    pullRequests,
  };
}

function issuePayload(issue) {
  return {
    number: issue.number, title: issue.title, body: issue.body || '', state: issue.state,
    url: issue.html_url, author: issue.user?.login || 'GitHub contributor',
    createdAt: issue.created_at, updatedAt: issue.updated_at, closedAt: issue.closed_at,
  };
}

async function listBridgeIssues(event) {
  trusted(event);
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await github(`/repos/${BRIDGE}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
    issues.push(...batch.filter(issue => !issue.pull_request).map(issuePayload));
    if (batch.length < 100) break;
  }
  return { repository: BRIDGE, issues };
}

async function createBridgeIssue(event, input) {
  trusted(event);
  const title = String(input?.title || '').trim().slice(0, 256);
  if (!title) throw new Error('A task title is required.');
  const issue = await github(`/repos/${BRIDGE}/issues`, {
    method: 'POST', body: JSON.stringify({ title, body: String(input?.body || '') }),
  });
  return issuePayload(issue);
}

async function updateBridgeIssue(event, input) {
  trusted(event);
  const number = Number(input?.number);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('A valid Bridge issue number is required.');
  const body = {};
  if (input.title !== undefined) body.title = String(input.title).trim().slice(0, 256);
  if (input.body !== undefined) body.body = String(input.body);
  if (input.state === 'open' || input.state === 'closed') body.state = input.state;
  const issue = await github(`/repos/${BRIDGE}/issues/${number}`, { method: 'PATCH', body: JSON.stringify(body) });
  return issuePayload(issue);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 900, minHeight: 650, backgroundColor: '#06070c',
    title: 'CROWDNET Manager', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  const webContentsId = win.webContents.id;
  trustedWebContents.add(webContentsId);
  win.webContents.once('destroyed', () => trustedWebContents.delete(webContentsId));
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
  ipcMain.handle('github:match-completed', matchCompletedPullRequests);
  ipcMain.handle('github:bridge-issues', listBridgeIssues);
  ipcMain.handle('github:create-bridge-issue', createBridgeIssue);
  ipcMain.handle('github:update-bridge-issue', updateBridgeIssue);
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
