// @ts-check
/// <reference lib="webworker" />
/// <reference types="./lib.webworker.d.ts" />

import {
  bufferTransfer,
  collectTransferables,
  getFileSystemHandle,
} from "./utils";

/** @type {Map<string, FileSystemSyncAccessHandle>} */
const accessHandleMap = new Map();

/** @type {import('./types').WorkerActionsMap} */
const actions = {
  read: (ah, args) => {
    const readSize = ah.read(...args);
    return bufferTransfer(args[0], readSize);
  },
  write: (ah, args) => ah.write(...args),
  truncate: (ah, args) => ah.truncate(...args),
  flush: (ah) => ah.flush(),
  getSize: (ah) => ah.getSize(),
  close: (ah, _args, path) => {
    ah.close();
    if (path) accessHandleMap.delete(path);
  },
};

/** @type {(ev: MessageEvent<import('./types').WorkerRequest>) => Promise<void>} */
globalThis.onmessage = async (ev) => {
  const { id, action, path, args } = ev.data;

  try {
    let result;

    if (action === "open") {
      // open must be called first, handle separately
      const fh = await getFileSystemHandle(path, {
        create: true,
        isFile: true,
      });
      const handle = await fh.createSyncAccessHandle(...args);
      accessHandleMap.set(path, handle);
      result = undefined; // open returns void
    } else {
      const ah = accessHandleMap.get(path);
      if (!ah) throw new Error("Invalid access handle");

      const fn = actions[action];
      if (!fn) throw new Error(`Invalid action: ${action}`);

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      result = fn(ah, args, path);
    }

    // Send response
    globalThis.postMessage(
      { id, action, result },
      { transfer: collectTransferables(result) },
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    globalThis.postMessage({
      id,
      action,
      error: { message: err.message, name: err.name },
    });
  }
};
