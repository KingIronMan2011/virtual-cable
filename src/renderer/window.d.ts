export {};

declare global {
  interface Window {
    // Tauri doesn't need global API objects by default if using @tauri-apps/api
  }
}
