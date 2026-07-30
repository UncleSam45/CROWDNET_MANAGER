'use strict';

// Electron installs the privileged bridge from preload.js. When the same UI is
// served by a normal browser, provide an equivalent in-memory GitHub adapter.
// The access key deliberately never enters localStorage or sessionStorage.
if (!window.crowdnet) {
  const BRIDGE = 'UNCLESAM45/CROWDNET_MANAGER_BRIDGE';
  let session = null;

  async function github(endpoint, options = {}) {
    if (!session?.accessKey) throw new Error('Authentication required.');
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${session.accessKey}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || `Bridge request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return options.raw ? response.arrayBuffer() : response.json();
  }

  const encode = value => btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join(''));
  const encodeBytes = bytes => {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };
  const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0)));
  const issuePayload = issue => ({
    number: issue.number, title: issue.title, body: issue.body || '', state: issue.state,
    url: issue.html_url, author: issue.user?.login || 'GitHub contributor',
    createdAt: issue.created_at, updatedAt: issue.updated_at, closedAt: issue.closed_at,
  });

  async function choosePdf() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    return new Promise(resolve => {
      input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  window.crowdnet = Object.freeze({
    loadCredentials: async () => null,
    authenticate: async input => {
      const username = String(input?.username || '').trim().slice(0, 80);
      const accessKey = String(input?.accessKey || '').trim();
      if (!username || !accessKey) throw new Error('Username and access key are required.');
      session = { username, accessKey };
      try { await github(`/repos/${BRIDGE}`); } catch (error) { session = null; throw error; }
      return { username };
    },
    restore: async () => {
      try {
        const file = await github(`/repos/${BRIDGE}/contents/system/workspace.json`);
        return { workspace: JSON.parse(decode(file.content)), sha: file.sha, source: 'bridge' };
      } catch (error) {
        if (error.status === 404) return { workspace: null, sha: null, source: 'new' };
        throw error;
      }
    },
    save: async payload => {
      const body = { message: `CROWDNET: ${payload.summary || 'update workspace'}`, content: encode(JSON.stringify(payload.workspace, null, 2)) };
      if (payload.sha) body.sha = payload.sha;
      try {
        const result = await github(`/repos/${BRIDGE}/contents/system/workspace.json`, { method: 'PUT', body: JSON.stringify(body) });
        return { sha: result.content.sha };
      } catch (error) {
        if (error.status === 409 || error.status === 422) return { conflict: true };
        throw error;
      }
    },
    matchCompletedPullRequests: async projectName => {
      const wanted = String(projectName).trim().toLocaleLowerCase('en-US');
      const repositories = await github('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100');
      const repository = repositories.find(item => item.name.toLocaleLowerCase('en-US') === wanted);
      if (!repository) return { matched: false, pullRequests: [] };
      const pulls = await github(`/repos/${repository.full_name}/pulls?state=closed&sort=updated&direction=desc&per_page=100`);
      return { matched: true, repository: { name: repository.name, fullName: repository.full_name, url: repository.html_url }, pullRequests: pulls.map(pull => ({ number: pull.number, title: pull.title, body: pull.body || '', url: pull.html_url, author: pull.user?.login || 'GitHub contributor', createdAt: pull.created_at, closedAt: pull.closed_at, mergedAt: pull.merged_at })) };
    },
    listBridgeIssues: async () => {
      const issues = await github(`/repos/${BRIDGE}/issues?state=all&sort=updated&direction=desc&per_page=100`);
      return { repository: BRIDGE, issues: issues.filter(issue => !issue.pull_request).map(issuePayload) };
    },
    createBridgeIssue: async input => issuePayload(await github(`/repos/${BRIDGE}/issues`, { method: 'POST', body: JSON.stringify({ title: String(input?.title || '').trim().slice(0, 256), body: String(input?.body || '') }) })),
    updateBridgeIssue: async input => issuePayload(await github(`/repos/${BRIDGE}/issues/${Number(input?.number)}`, { method: 'PATCH', body: JSON.stringify({ title: input.title, body: input.body, state: input.state }) })),
    uploadDocumentation: async input => {
      const file = await choosePdf();
      if (!file) return { canceled: true };
      if (file.size > 20 * 1024 * 1024) throw new Error('PDF files must be 20 MB or smaller.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('The selected file is not a valid PDF.');
      const result = await github(`/repos/${BRIDGE}/contents/documentation/${input.id}.pdf`, { method: 'PUT', body: JSON.stringify({ message: `CROWDNET: add documentation ${String(input.title || '').slice(0, 100)}`, content: encodeBytes(bytes) }) });
      return { canceled: false, path: `documentation/${input.id}.pdf`, sha: result.content.sha, size: file.size, fileName: file.name };
    },
    prepareDocumentation: async input => {
      const data = await github(`/repos/${BRIDGE}/contents/documentation/${input.id}.pdf`, { raw: true, headers: { Accept: 'application/vnd.github.raw+json' } });
      return { url: URL.createObjectURL(new Blob([data], { type: 'application/pdf' })), size: data.byteLength };
    },
    deleteDocumentation: async input => {
      await github(`/repos/${BRIDGE}/contents/documentation/${input.id}.pdf`, { method: 'DELETE', body: JSON.stringify({ message: `CROWDNET: remove documentation ${String(input.title || '').slice(0, 100)}`, sha: String(input.sha || '') }) });
      return { deleted: true };
    },
  });
}
