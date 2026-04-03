# TODO

A running list of potential improvements and features.

---

## Audio

- [ ] **Volume / gain control per cable** — slider on each card to attenuate the signal before it hits the output
- [ ] **Mute toggle per cable** — silence a cable without destroying the stream
- [ ] **VU meter** — real-time input level indicator on each card so you can confirm audio is actually flowing
- [ ] **Latency / buffer size setting** — expose PortAudio's `framesPerBuffer` as a user-facing low/medium/high latency option
- [ ] **Sample rate display** — show the negotiated sample rate on each active cable for debugging
- [ ] **Multi-channel support** — currently capped at stereo; allow mono selection for microphones that perform better in mono

---

## Multi-source mixing (bigger feature)

The current model is 1 input → 1 output. This tracks a richer mixing model:

- [ ] **Multiple inputs per cable** — allow adding more than one input source to a single cable (e.g. mic + Spotify → VB-Audio CABLE)
- [ ] **Application audio capture** — list running apps that produce audio (e.g. Spotify, Chrome, Discord) as selectable input sources alongside hardware devices; requires WASAPI loopback capture per process
- [ ] **Per-source volume** — individual gain slider for each input source within a multi-source cable
- [ ] **Input priority / ducking** — optional feature per cable; designate one source as the priority (e.g. main mic) so when it crosses a configurable volume threshold, all other sources in that cable are automatically ducked (reduced in volume); duck amount and threshold configurable
- [ ] **Priority toggle** — the ducking/priority feature should be addable and removable per cable without affecting the other sources
- [ ] **Ducking release time** — configurable fade-back time after the priority source goes quiet, so the other sources smoothly return to full volume instead of snapping back

---

## UI / UX

- [ ] **Inline cable rename** — click the cable name to edit it in place instead of being stuck with "Cable 01"
- [ ] **Drag to reorder cables** — let users arrange cables in whatever order makes sense to them
- [ ] **Minimize to system tray** — keep the app running in the background without a taskbar presence
- [ ] **Launch on Windows startup** — add/remove a registry entry so cables are restored automatically at boot
- [ ] **Minimize to tray on close** — option to keep routing alive when the window is closed
- [ ] **Window size / position persistence** — remember where the user left the window

---

## VB-Audio

- [ ] **Re-detect without restart** — after installing VB-Audio, add a "Re-scan devices" button so the user doesn't have to restart the app
- [ ] **Support additional VB-Audio CABLE pairs** — VB-Audio offers A/B/C/D virtual cables; surface them clearly in the device list

---

## Distribution / CI

- [ ] **Code signing (Windows)** — sign the installer with an EV certificate to avoid SmartScreen warnings on first run
- [ ] **Code signing (macOS)** — required for Squirrel auto-update to work on macOS; needs an Apple Developer account and notarization
- [ ] **Universal macOS binary** — build a single `arm64 + x64` app with `arch: 'universal'` in Forge so one release covers all Macs natively
- [ ] **Intel macOS build** — add `macos-13` runner to the release matrix for users still on Intel Macs until a universal build is set up
- [ ] **Delta updates** — generate delta `.nupkg` files so updates only download the diff rather than the full package

---

## Settings

- [ ] **Keyboard shortcuts** — at minimum a shortcut to add a new cable and toggle the settings panel
- [ ] **Export / import cable layout** — save a named preset of cables + device assignments to a JSON file for easy sharing or backup
