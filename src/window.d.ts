export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window {
    // Tauri doesn't need global API objects by default if using @tauri-apps/api
  }
}
