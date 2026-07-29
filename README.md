# CrowdNet Manager

An animated, secure Electron command center for projects, task workspaces,
operational knowledge, activity, and responsibility. The private
`UNCLESAM45/CROWDNET_MANAGER_BRIDGE` repository is the authoritative workspace;
the application automatically restores and revision-safely saves
`system/workspace.json` through GitHub's Contents API.

Open tasks are mirrored exclusively to GitHub Issues in that Bridge repository.
Creating or editing a task creates or updates its linked issue, and completing a
task closes the issue and preserves the result in the Databank. On restore, the
manager reconciles both open and closed Bridge issues into the workspace. Closed
pull requests from the repository whose name matches a project remain a second
source of completed tasks; issues from those target repositories are ignored.

## Start

Install [Node.js 20+](https://nodejs.org/) and run:

```bash
python main.py
```

On first launch, the Python entry point installs the local Electron runtime.
Later launches reuse it. The access key is verified against the private bridge
repository using GitHub's API. Credentials remain in memory unless **Remember
my credentials securely** is selected. Remembered credentials are encrypted
through Electron's operating-system-backed `safeStorage` API and can be removed
by signing in once with the option cleared.

The renderer is sandboxed and receives only a narrow IPC bridge. GitHub access
keys never enter local storage or public web assets. Successful changes are
optimistic in the interface, queued automatically, and written with the last
known Git blob SHA. A changed SHA produces a visible conflict rather than a
silent overwrite; network failures retain the latest workspace in the local
desktop cache.

On Windows, the launcher automatically resolves Node's `npm.cmd` shim. If npm
is not found, reinstall Node.js with **Add to PATH** enabled and open a new
terminal before starting CrowdNet again.
