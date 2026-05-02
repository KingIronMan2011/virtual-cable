# Virtual Cable

A desktop app for creating on-demand audio tunnels between any input and output devices on your system. Built with Tauri, React, TypeScript, and Rust.

![License](https://img.shields.io/badge/license-MIT-amber) ![Platform](https://img.shields.io/badge/platform-Windows-blue)

---

## What it does

Virtual Cable lets you patch any microphone or audio input directly to any speaker or audio output — like a software patchbay. Cables persist between sessions and can be toggled live at any time.

For virtual devices visible to other applications (DAWs, browsers, OBS, etc.), install the free **VB-Audio Virtual Cable** driver — the app will prompt you automatically and can install it for you.

---

## Prerequisites

Before building, make sure you have the following installed:

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **Rust** v1.77 or later — [rustup.rs](https://rustup.rs/)
- **Visual Studio Build Tools** with the **Desktop development with C++** workload — required to compile the native C++ audio engine
  - Download: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - During install, check **Desktop development with C++**
- **Tauri CLI** — installed automatically via `npm install`

---

## Development

### 1. Clone and install dependencies

```bash
git clone https://github.com/KingIronMan2011/virtual-cable.git
cd virtual-cable
npm install
```

### 2. Start in development mode

```bash
npm run tauri dev
```

This launches Tauri with hot-reload via Vite. The app opens immediately with the Rust backend compiled.

---

## Building an installer

Virtual Cable uses Tauri's built-in packaging system to create installers.

```bash
npm run build
```

This produces a **Windows Installer (MSI)** and **NSIS installer** in:

```dir
src-tauri/target/release/bundle/
```

You'll find:

| File                                    | Description                    |
| --------------------------------------- | ------------------------------ |
| `Virtual Cable_1.X.X_x64-setup.exe`     | NSIS portable installer        |
| `Virtual Cable_1.X.X_x64-setup.exe.sig` | Update signature (for updater) |

### Installing

1. Run `Virtual Cable_1.X.X_x64-setup.exe`
2. The app installs and launches automatically
3. After installation, find it in:
   - **Start Menu** → Virtual Cable
   - **`%LocalAppData%\virtual-cable\`**

### Uninstalling

Go to **Settings → Apps → Installed apps** and uninstall **Virtual Cable**, or use your installer's uninstall option.

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

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Shell     | Tauri 2.x                             |
| UI        | React 19 + TypeScript                 |
| Styling   | Tailwind CSS v4                       |
| Build     | Vite                                  |
| Backend   | Rust + C++ (PortAudio + WASAPI)       |
| Audio     | C++ engine with PortAudio integration |
| Installer | Tauri bundler (MSI + NSIS)            |

---

## License

[MIT](./LICENSE) © 2026 KingIronMan2011
