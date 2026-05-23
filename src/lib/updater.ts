/// Gravity-Claw Auto-Update Checker
///
/// Uses Tauri's updater plugin to check for new releases and install them.
/// Runs silently on app start; shows a banner when an update is found.

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getTauriWindow, isTauriRuntime } from './tauriBridge';

export interface UpdateInfo {
  version: string;
  body?: string;
  date?: string;
}

let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null;

/**
 * Silently checks for updates on app startup.
 * Returns update metadata if available, null otherwise.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    // Only run inside Tauri desktop builds
    const tauriWindow = getTauriWindow();
    if (!tauriWindow || !isTauriRuntime(tauriWindow)) {
      return null;
    }

    const update = await check();
    if (update?.available) {
      pendingUpdate = update;
      return {
        version: update.version,
        body: update.body,
        date: update.date,
      };
    }
  } catch (err) {
    console.warn('[updater] Check failed:', err);
  }
  return null;
}

/**
 * Downloads and installs the pending update, then relaunches the app.
 */
export async function installUpdate(onProgress?: (downloaded: number, total?: number) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('No pending update');
  }

  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === 'Progress' && onProgress) {
      onProgress(
        event.data.chunkLength,
        (event.data as unknown as { contentLength?: number }).contentLength
      );
    }
  });

  await relaunch();
}

/**
 * Returns true if an update is waiting to be installed.
 */
export function hasPendingUpdate(): boolean {
  return pendingUpdate !== null;
}
