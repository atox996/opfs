import OPFileWorker from "./file.worker?worker&inline";
import OPFS from "./opfs";
import type {
  Deferred,
  FileSystemSyncAccessHandleOptions,
  FileSystemSyncAccessMode,
  WorkerAction,
  WorkerActionArgs,
  WorkerActionResult,
  WorkerResponse,
} from "./types";
import { collectTransferables, getFileSystemHandle, uuid } from "./utils";

const createFileWorker = (): {
  open: (
    path: string,
    options?: FileSystemSyncAccessHandleOptions,
  ) => Promise<void>;
  send: <A extends WorkerAction>(
    action: A,
    path: string,
    ...args: WorkerActionArgs[A]
  ) => Promise<WorkerActionResult[A]>;
} => {
  let worker: Worker | null = null;
  let openCount = 0;

  const deferredMap = new Map<
    string,
    Deferred<WorkerActionResult[WorkerAction]>
  >();
  const send = <A extends WorkerAction>(
    action: A,
    path: string,
    ...args: WorkerActionArgs[A]
  ) => {
    if (!worker)
      throw new DOMException(
        "Worker is not initialized. Call open() first.",
        "InvalidStateError",
      );
    const id = uuid();
    const { promise, resolve, reject } =
      Promise.withResolvers<WorkerActionResult[WorkerAction]>();
    deferredMap.set(id, { resolve, reject });
    worker.postMessage(
      { id, action, path, args },
      {
        transfer: collectTransferables(...args),
      },
    );
    return promise as Promise<WorkerActionResult[A]>;
  };

  const open = async (
    path: string,
    options?: FileSystemSyncAccessHandleOptions,
  ): Promise<void> => {
    if (!worker) {
      worker = new OPFileWorker();
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const { id, action, result, error } = ev.data;
        const deferred = deferredMap.get(id);
        if (!deferred) {
          console.warn("[OPFile]", "No deferred found for id:", id);
          return;
        }
        deferredMap.delete(id);
        if (error)
          deferred.reject(new Error(`${error.name}: ${error.message}`));
        else deferred.resolve(result);

        if (action === "open") {
          openCount++;
        } else if (action === "close") {
          openCount--;
          if (openCount <= 0) {
            worker?.terminate();
            worker = null;
            openCount = 0;
            for (const [, deferred] of deferredMap) {
              deferred.reject(
                new DOMException("Worker terminated", "AbortError"),
              );
            }
            deferredMap.clear();
          }
        }
      };
      worker.onerror = (ev) => {
        for (const [, deferred] of deferredMap) deferred.reject(ev);
        deferredMap.clear();
      };
    }
    await send("open", path, options);
  };

  return { open, send };
};

const fileWorker = createFileWorker();

/**
 * Read-only file handle.
 * Provides methods for reading and querying file size.
 */
export class FileRO {
  constructor(readonly fullPath: string) {}

  private prevReadOffset = 0;

  /**
   * Read data from the file.
   * @param size - Number of bytes or a preallocated buffer.
   * @param options - Optional `at` offset to read from.
   * @returns A Promise resolving to an ArrayBuffer of read data.
   */
  async read(
    size: number | BufferSource,
    options?: { at?: number },
  ): Promise<ArrayBuffer> {
    const buffer = typeof size === "number" ? new Uint8Array(size) : size;
    const at = options?.at ?? this.prevReadOffset;
    const result = await fileWorker.send("read", this.fullPath, buffer, { at });
    this.prevReadOffset = at + result.byteLength;
    return result;
  }

  /** Get file size in bytes. */
  getSize(): Promise<number> {
    return fileWorker.send("getSize", this.fullPath);
  }

  /** Close the file handle. */
  async close(): Promise<void> {
    return fileWorker.send("close", this.fullPath);
  }
}

/**
 * Read-write file handle.
 * Extends FileRO with write and truncate capabilities.
 */
export class FileRW extends FileRO {
  private textEncoder = new TextEncoder();
  private prevWriteOffset = 0;

  /**
   * Write data to the file.
   * @param data - String or buffer to write.
   * @param options - Optional `at` offset to write at.
   * @returns Number of bytes written.
   */
  async write(
    data: string | BufferSource,
    options?: { at?: number },
  ): Promise<number> {
    const content =
      typeof data === "string" ? this.textEncoder.encode(data) : data;
    const at = options?.at ?? this.prevWriteOffset;
    const result = await fileWorker.send("write", this.fullPath, content, {
      at,
    });
    this.prevWriteOffset = at + result;
    return result;
  }

  /**
   * Truncate the file to a specified size.
   * @param newSize - New size of the file in bytes.
   */
  async truncate(newSize: number): Promise<void> {
    await fileWorker.send("truncate", this.fullPath, newSize);
    if (this.prevWriteOffset > newSize) this.prevWriteOffset = newSize;
  }

  /** Flush pending writes to the file. */
  flush(): Promise<void> {
    return fileWorker.send("flush", this.fullPath);
  }
}

/**
 * Represents a file in OPFS (Origin Private File System).
 * Provides create, read, write, copy, move operations.
 *
 * @example
 * ```ts
 * import { file } from "@opfs.js/core";
 *
 * const myFile = file("/docs/example.txt");
 *
 * // Create
 * await myFile.create();
 *
 * // Write
 * const rw = await myFile.open({ mode: "readwrite" });
 * await rw.write("Hello OPFS!");
 * await rw.flush();
 * await rw.close();
 *
 * // Read
 * const ro = await myFile.open({ mode: "read-only" });
 * const buffer = await ro.read(1024);
 * await ro.close();
 *
 * // Move file
 * const destDir = await navigator.storage.getDirectory();
 * await myFile.moveTo(destDir);
 * ```
 */
class OPFile extends OPFS {
  /** File kind: always "file" */
  readonly kind = "file";

  /** Create the file if it does not exist. */
  async create(): Promise<FileSystemFileHandle> {
    return await getFileSystemHandle(this.fullPath, {
      create: true,
      isFile: true,
    });
  }

  /** Check whether the file exists. */
  async exists(): Promise<boolean> {
    return (
      (await getFileSystemHandle(this.fullPath, {
        create: false,
        isFile: true,
      })) !== null
    );
  }

  /** Remove the file. */
  async remove(): Promise<void> {
    const parentPath = this.parents.join("/");
    const parentHandle = await getFileSystemHandle(parentPath, {
      create: false,
      isFile: false,
    });
    if (!parentHandle)
      throw new DOMException(
        `Parent directory "${parentPath}" does not exist`,
        "NotFoundError",
      );
    await parentHandle.removeEntry(this.name);
  }

  /**
   * Copy the file to a destination directory, file handle, or OPFile.
   * @param dest - Destination
   */
  async copyTo(
    dest: FileSystemDirectoryHandle | FileSystemFileHandle | OPFS,
  ): Promise<void> {
    let targetFile: FileSystemFileHandle;
    if (dest instanceof FileSystemDirectoryHandle) {
      targetFile = await dest.getFileHandle(this.name, { create: true });
    } else if (dest instanceof FileSystemFileHandle) {
      targetFile = dest;
    } else if (dest.kind === "directory") {
      return this.copyTo(await dest.create());
    } else {
      targetFile = (await dest.create()) as FileSystemFileHandle;
    }
    await (await this.stream()).pipeTo(await targetFile.createWritable());
  }

  /**
   * Move the file to a destination directory, file handle, or OPFile.
   * @param dest - Destination
   */
  async moveTo(
    dest: FileSystemDirectoryHandle | FileSystemFileHandle | OPFS,
  ): Promise<void> {
    await this.copyTo(dest);
    await this.remove();
  }

  /**
   * Open the file for reading or writing.
   * @param options - File access mode
   * @returns `FileRO` if mode is "read-only", else `FileRW`
   */
  async open(options: { mode: "read-only" }): Promise<FileRO>;
  async open(options?: {
    mode?: Exclude<FileSystemSyncAccessMode, "read-only">;
  }): Promise<FileRW>;
  async open(options?: FileSystemSyncAccessHandleOptions) {
    await fileWorker.open(this.fullPath, options);
    if (options?.mode === "read-only") return new FileRO(this.fullPath);
    return new FileRW(this.fullPath);
  }

  /** Read the file as text. */
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  /** Read the file as ArrayBuffer. */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const file = await this.getFile();
    if (!file) throw new DOMException("File not found", "NotFoundError");
    return file.arrayBuffer();
  }

  /** Get a ReadableStream for the file content. */
  async stream(): Promise<ReadableStream<BufferSource>> {
    const file = await this.getFile();
    if (!file) throw new DOMException("File not found", "NotFoundError");
    return file.stream();
  }

  /** Get the underlying File object. */
  async getFile(): Promise<File | undefined> {
    return (
      await getFileSystemHandle(this.fullPath, { create: false, isFile: true })
    )?.getFile();
  }
}

/** Create an OPFile instance for the given path. */
function file(path: string): OPFile {
  return new OPFile(path);
}

export { file, OPFile };
