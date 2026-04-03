# Virtual Cable

A desktop app for creating on-demand audio tunnels between any input and output devices on your system. Built with Electron, React, TypeScript, and Tailwind CSS v4.

![License](https://img.shields.io/badge/license-MIT-amber) ![Platform](https://img.shields.io/badge/platform-Windows-blue)

---

## What it does

Virtual Cable lets you patch any microphone or audio input directly to any speaker or audio output — like a software patchbay. Cables persist between sessions and can be toggled live at any time.

For virtual devices visible to other applications (DAWs, browsers, OBS, etc.), install the free **VB-Audio Virtual Cable** driver — the app will prompt you automatically and can install it for you.

---

## Prerequisites

Before building, make sure you have the following installed:

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **Visual Studio Build Tools** with the **Desktop development with C++** workload — required to compile the native `naudiodon` audio addon
  - Download: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - During install, check **Desktop development with C++**

---

## Development

### 1. Clone and install dependencies

```bash
git clone https://github.com/KingIronMan2011/virtual-cable.git
cd virtual-cable
npm install
```

`npm install` automatically runs `electron-rebuild` to compile the native PortAudio addon for your Electron version.

### 2. Start in development mode

```bash
npm start
```

This launches Electron with hot-reload via Vite. The app opens immediately.

---

## Building an installer

Virtual Cable uses [Electron Forge](https://www.electronforge.io/) to package and create installers.

### Package (no installer, just the app folder)

```bash
npm run package
```

Output is placed in:

```dir
out/virtual-cable-win32-x64/
```

The main executable is:

```dir
out/virtual-cable-win32-x64/virtual-cable.exe
```

You can run this `.exe` directly without installing anything.

---

### Make (creates a proper installer)

```bash
npm run make
```

This produces a **Squirrel Windows installer** (`.exe` setup file) in:

```dir
out/make/squirrel.windows/x64/
```

Inside that folder you will find:

| File                             | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `virtual-cable-1.X.X Setup.exe`  | The installer — run this to install the app    |
| `virtual-cable-1.X.X-full.nupkg` | Squirrel update package                        |
| `RELEASES`                       | Release manifest used by Squirrel auto-updater |

#### Installing

1. Run `virtual-cable-1.X.X Setup.exe`
2. The app installs silently and launches automatically
3. After installation, find it in:
   - **Start Menu** → Virtual Cable
   - **`%LocalAppData%\virtual-cable\`**

#### Uninstalling

Go to **Settings → Apps** and uninstall **Virtual Cable** from there, or run:

```dir
%LocalAppData%\virtual-cable\Update.exe --uninstall
```

---

## VB-Audio Virtual Cable

To route audio into other applications (DAWs, Discord, OBS, browsers), you need the **VB-Audio Virtual Cable** kernel driver. It creates virtual "CABLE Input" and "CABLE Output" devices visible system-wide.

- The app detects whether it is installed on startup
- If missing, a prompt appears — click **Auto-install** to download and launch the installer automatically, or **Open page ↗** to download manually from [vb-audio.com/Cable](https://www.vb-audio.com/Cable/)
- A UAC (administrator) prompt will appear during driver installation — this is expected
- **Restart Virtual Cable after installing the driver**

VB-Audio Virtual Cable is free software by VB-Audio Software.

---

## Tech stack

| Layer     | Technology                    |
| --------- | ----------------------------- |
| Shell     | Electron 41                   |
| UI        | React 19 + TypeScript         |
| Styling   | Tailwind CSS v4               |
| Build     | Electron Forge v7 + Vite      |
| Audio     | naudiodon (PortAudio binding) |
| Installer | Squirrel.Windows              |

---

## License

[MIT](./LICENSE) © 2026 KingIronMan2011
