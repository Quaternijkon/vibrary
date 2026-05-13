import type { VibraryDesktopApi } from "../preload/preload";

declare global {
  interface Window {
    vibraryDesktop: VibraryDesktopApi;
  }
}

export {};
