# Windows: Fix "npm ERR! Exit handler never called!"

This error is almost always caused by an npm/Node installation issue or a corrupted npm cache on Windows.

## 1) Check versions
Open **PowerShell** in the project folder and run:

```powershell
node -v
npm -v
```

Recommended for this project:
- Node.js **20 LTS**
- npm **10+**

If you're below that, update Node (reinstall from nodejs.org LTS) or use nvm-windows.

## 2) Clean cache + fresh install (safe)
Close all terminals, then run:

```powershell
npm cache clean --force
rmdir /s /q node_modules 2>$null
del /f /q package-lock.json 2>$null
npm install
```

If you do NOT want to delete the lockfile, you can keep it and run:
```powershell
rmdir /s /q node_modules 2>$null
npm ci
```

## 3) If still failing: reset npm cache folder
Delete the npm cache directory:

`%LOCALAPPDATA%\npm-cache`

Then retry `npm install`.

## 4) If still failing: use pnpm (bypass npm)
Node 20 includes Corepack.

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm run build
```

Deploy as usual:
```powershell
firebase deploy --only hosting
```

## 5) Antivirus / controlled folder access
On Windows, some AV products can break npm installs.
If steps above fail, temporarily disable AV real-time scanning for the project folder, then retry.

