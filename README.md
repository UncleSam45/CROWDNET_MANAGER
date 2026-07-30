# CrowdNet Manager

An animated, secure Electron command center for projects, task workspaces,
operational knowledge, activity, and responsibility. The primary private server is the authoritative workspace index;
the application automatically restores and revision-safely saves
`system/workspace.json` through the secured server API.

Open tasks are mirrored exclusively to server work items.
Creating or editing a task creates or updates its linked issue, and completing a
task closes the issue and preserves the result in the Databank. On restore, the
manager reconciles both open and closed server work items into the workspace and
continues polling while the application is active, so issues closed directly on
GitHub move into completed tasks and the Databank without a restart. Closed
pull requests from the repository whose name matches a project remain a second
source of completed tasks; issues from those target repositories are ignored.

The **Board** is a connected, project-by-project execution canvas. Tasks appear as owner-colored post-its, ordered paths are drawn automatically, and each person can be assigned a distinct color. A project may use the primary server or any accessible server whose name contains `BRIDGE`; only its name and server routing remain in the shared index, while its task workspace stays on the selected server. Users without that server in their access key receive a privacy-preserving restricted view.

The **Info** tab is a shared documentation library. Members can give a document
a title and upload a PDF of up to 20 MB; the file is committed to the private
primary server under `documentation/`, while its title and audit metadata are kept in
the synchronized workspace. Documents open in an animated, full-workspace PDF
reader without leaving the application, and can be removed from both the
library and its server.

## Start

Install [Node.js 20+](https://nodejs.org/) and run:

```bash
python main.py
```

The interface can also be served by any static web server and opened in a
modern browser (for example, `python -m http.server 8000`). The browser adapter
connects directly to the server fleet after sign-in; the access key is retained in memory
only and is discarded when the tab closes. Secure credential remembering and
the offline desktop cache remain Electron-only features.

On first launch, the Python entry point installs the local Electron runtime.
Later launches reuse it. The access key is verified against the primary private server through its secured API. Credentials remain in memory unless **Remember
my credentials securely** is selected. Remembered credentials are encrypted
through Electron's operating-system-backed `safeStorage` API and can be removed
by signing in once with the option cleared.

The renderer is sandboxed and receives only a narrow IPC bridge. Access keys never enter local storage or public web assets. Successful changes are
optimistic in the interface, queued automatically, and written with the last
known Git blob SHA. A changed SHA produces a visible conflict rather than a
silent overwrite; network failures retain the latest workspace in the local
desktop cache.

On Windows, the launcher automatically resolves Node's `npm.cmd` shim. If npm
is not found, reinstall Node.js with **Add to PATH** enabled and open a new
terminal before starting CrowdNet again.
