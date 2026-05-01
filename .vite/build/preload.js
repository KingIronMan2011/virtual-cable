let electron = require("electron");
//#region src/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getDevices: () => electron.ipcRenderer.invoke("audio:getDevices"),
	getAudioApps: () => electron.ipcRenderer.invoke("audio:getAudioApps"),
	createTunnel: (id, inputs, outputId, channelCount, ducking) => electron.ipcRenderer.invoke("audio:createTunnel", id, inputs, outputId, channelCount, ducking),
	destroyTunnel: (id) => electron.ipcRenderer.invoke("audio:destroyTunnel", id),
	checkVBAudioInstalled: () => electron.ipcRenderer.invoke("vbaudio:checkInstalled"),
	installVBAudio: () => electron.ipcRenderer.invoke("vbaudio:install"),
	downloadAndInstallVBAudio: () => electron.ipcRenderer.invoke("vbaudio:downloadAndInstall"),
	onVBAudioProgress: (cb) => {
		const listener = (_, data) => cb(data.stage, data.pct);
		electron.ipcRenderer.on("vbaudio:progress", listener);
		return () => electron.ipcRenderer.removeListener("vbaudio:progress", listener);
	},
	loadTunnels: () => electron.ipcRenderer.invoke("store:loadTunnels"),
	exportLayout: (json) => electron.ipcRenderer.invoke("store:exportLayout", json),
	importLayout: () => electron.ipcRenderer.invoke("store:importLayout"),
	saveTunnels: (tunnels) => electron.ipcRenderer.invoke("store:saveTunnels", tunnels),
	loadSettings: () => electron.ipcRenderer.invoke("settings:load"),
	saveSettings: (settings) => electron.ipcRenderer.invoke("settings:save", settings),
	checkForUpdates: () => electron.ipcRenderer.invoke("update:check"),
	installUpdate: () => electron.ipcRenderer.invoke("update:install"),
	getUpdateState: () => electron.ipcRenderer.invoke("update:getState"),
	onUpdateStatus: (cb) => {
		const listener = (_, state) => cb(state);
		electron.ipcRenderer.on("update:status", listener);
		return () => electron.ipcRenderer.removeListener("update:status", listener);
	},
	getTunnelSampleRate: (id) => electron.ipcRenderer.invoke("audio:getTunnelSampleRate", id),
	getTunnelChannelCount: (id) => electron.ipcRenderer.invoke("audio:getTunnelChannelCount", id),
	setTunnelMuted: (id, muted) => electron.ipcRenderer.invoke("audio:setTunnelMuted", id, muted),
	setTunnelGain: (id, gain) => electron.ipcRenderer.invoke("audio:setTunnelGain", id, gain),
	setTunnelInputGain: (id, inputIndex, gain) => electron.ipcRenderer.invoke("audio:setTunnelInputGain", id, inputIndex, gain),
	setTunnelInputPriority: (id, inputIndex, priority) => electron.ipcRenderer.invoke("audio:setTunnelInputPriority", id, inputIndex, priority),
	setTunnelDucking: (id, ducking) => electron.ipcRenderer.invoke("audio:setTunnelDucking", id, ducking),
	onAudioLevel: (cb) => {
		const listener = (_, tunnelId, level) => cb(tunnelId, level);
		electron.ipcRenderer.on("audio:level", listener);
		return () => electron.ipcRenderer.removeListener("audio:level", listener);
	}
});
//#endregion
