# CrowdNet Manager

An animated, secure Electron login portal for the CrowdNet project workspace.

## Start

Install [Node.js 20+](https://nodejs.org/) and run:

```bash
python main.py
```

On first launch, the Python entry point installs the local Electron runtime.
Later launches reuse it. The access key is verified against the private bridge
repository using GitHub's API; it is kept in memory for the authentication
request and is not written to disk.

On Windows, the launcher automatically resolves Node's `npm.cmd` shim. If npm
is not found, reinstall Node.js with **Add to PATH** enabled and open a new
terminal before starting CrowdNet again.
