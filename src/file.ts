import { OPFS } from "./opfs";
import type {
  Deferred,
  WorkerAction,
  WorkerActionArgs,
  WorkerActionResult,
  WorkerResponse,
} from "./types";
import {
  collectTransferables,
  getFileSystemHandle,
  parsePath,
  uuid,
} from "./utils";

const createFileWorker = () => {
  let worker: Worker;
  const deferredMap = new Map<
    string,
    Deferred<WorkerActionResult[WorkerAction]>
  >();
  const open = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./file.worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = ev.data;
      const deferred = deferredMap.get(id);
      if (!deferred) {
        console.warn("[OPFile]", "No deferred found for id:", id);
        return;
      }
      deferredMap.delete(id);
      if (error) deferred.reject(new Error(`${error.name}: ${error.message}`));
      else deferred.resolve(result);
    };
    worker.onerror = (ev) => {
      for (const [, deferred] of deferredMap) deferred.reject(ev);
      deferredMap.clear();
    };
  };
  const send = <A extends WorkerAction>(
    action: A,
    path: string,
    ...args: WorkerActionArgs[A]
  ) => {
    if (!worker)
      throw new DOMException("File is not open", "InvalidStateError");
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
  return { open, send };
};
const fileWorker = createFileWorker();

/**
 * Create file object
 *
 * Factory function for creating OPFile instances. This is the recommended way to create file objects.
 *
 * @param path - File path
 * @returns OPFile - File object instance
 * @example
 * ```typescript
 * const myFile = file("/path/to/file.txt");
 * await myFile.create(); // Create file
 *
 * // Check if file exists
 * if (await myFile.exists()) {
 *   console.log("File exists");
 * }
 * ```
 */
export const file = (path: string): OPFile => new OPFile(path);

/**
 * Write data to file
 *
 * Convenience function for writing data to a specified file. Supports multiple data formats and write modes.
 * Automatically handles file opening, writing and closing operations.
 *
 * @param target - Target file, can be file path string or OPFile object
 * @param data - Data to write, supports string, BufferSource, ReadableStream or OPFile
 * @param overwrite - Whether to overwrite existing content, defaults to true
 * @returns Promise<void>
 * @throws {DOMException} Throws corresponding exception when write fails
 * @example
 * ```typescript
 * // Write string
 * await write("/path/to/file.txt", "Hello, World!");
 *
 * // Write ArrayBuffer
 * const buffer = new TextEncoder().encode("Hello, World!");
 * await write("/path/to/file.txt", buffer);
 *
 * // Write stream data
 * const stream = new ReadableStream({
 *   start(controller) {
 *     controller.enqueue(new TextEncoder().encode("Hello"));
 *     controller.enqueue(new TextEncoder().encode("World"));
 *     controller.close();
 *   }
 * });
 * await write("/path/to/file.txt", stream);
 *
 * // Copy file
 * const sourceFile = file("/path/to/source.txt");
 * await write("/path/to/destination.txt", sourceFile);
 *
 * // Append mode (no overwrite)
 * await write("/path/to/file.txt", "Additional content", false);
 * ```
 */
export const write = async (
  target: string | OPFile,
  data: string | BufferSource | ReadableStream<BufferSource> | OPFile,
  overwrite = true,
): Promise<void> => {
  if (data instanceof OPFile) {
    return write(target, await data.stream(), overwrite);
  }
  const writer = target instanceof OPFile ? target : file(target);
  try {
    await writer.open({ mode: "readwrite" });
    if (overwrite) await writer.truncate(0);
    if (data instanceof ReadableStream) {
      const reader = data.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } else {
      await writer.write(data);
    }
    await writer.flush();
  } finally {
    await writer.close();
  }
};

/**
 * File class
 *
 * Inherits from OPFS abstract class, provides file-related operation functionality.
 * Includes file opening, reading, writing, truncating, flushing, closing and other operations.
 * Uses Web Workers for asynchronous file operations to avoid blocking the main thread.
 *
 * @example
 * ```typescript
 * const myFile = file("/path/to/file.txt");
 *
 * // Open file for read/write
 * await myFile.open({ mode: "readwrite" });
 *
 * // Write data
 * await myFile.write("Hello, World!");
 *
 * // Read data
 * const data = await myFile.read(1024);
 *
 * // Close file
 * await myFile.close();
 * ```
 */
export class OPFile extends OPFS {
  /** File type identifier */
  readonly kind = "file";

  /** Text encoder for converting strings to bytes */
  private textEncoder = new TextEncoder();
  /** Offset of the last write operation */
  private prevWriteOffset = 0;
  /** Offset of the last read operation */
  private prevReadOffset = 0;

  /**
   * Open file
   *
   * Open file for synchronous access operations. Must be called before reading and writing operations.
   * Uses Web Worker for asynchronous operations to avoid blocking the main thread.
   *
   * @param options - File system synchronous access handle options
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when file opening fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   *
   * // Open file in read/write mode
   * await myFile.open({ mode: "readwrite" });
   *
   * // Open file in read-only mode
   * await myFile.open({ mode: "readonly" });
   * ```
   */
  async open(options?: FileSystemSyncAccessHandleOptions): Promise<void> {
    fileWorker.open();
    return fileWorker.send("open", this.fullPath, options);
  }
  /**
   * Read data from file
   *
   * Read specified size of data from specified position in the file. If position is not specified, continues from last read position.
   *
   * @param size - Number of bytes to read, or provide a preallocated buffer
   * @param options - Read options
   * @param options.at - Starting position for reading, continues from last read position if not specified
   * @returns Promise<ArrayBuffer> - Read data
   * @throws {DOMException} Throws corresponding exception when reading fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readonly" });
   *
   * // Read 1024 bytes
   * const data1 = await myFile.read(1024);
   *
   * // Read from specified position
   * const data2 = await myFile.read(512, { at: 0 });
   *
   * // Use preallocated buffer
   * const buffer = new Uint8Array(256);
   * const data3 = await myFile.read(buffer);
   * ```
   */
  async read(
    size: number | BufferSource,
    options?: { at?: number },
  ): Promise<ArrayBuffer> {
    const buffer = typeof size === "number" ? new Uint8Array(size) : size;
    const at = options?.at ?? this.prevReadOffset;
    const result = await fileWorker.send("read", this.fullPath, buffer, {
      ...options,
      at,
    });
    this.prevReadOffset = at + result.byteLength;
    return result;
  }

  /**
   * Write data to file
   *
   * Write data to specified position in the file. If position is not specified, continues from last write position.
   * Supports writing strings or binary data.
   *
   * @param data - Data to write, can be string or BufferSource
   * @param options - Write options
   * @param options.at - Starting position for writing, continues from last write position if not specified
   * @returns Promise<number> - Number of bytes actually written
   * @throws {DOMException} Throws corresponding exception when writing fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   *
   * // Write string
   * const bytesWritten1 = await myFile.write("Hello, World!");
   *
   * // Write from specified position
   * const bytesWritten2 = await myFile.write("Additional content", { at: 0 });
   *
   * // Write binary data
   * const buffer = new TextEncoder().encode("Binary data");
   * const bytesWritten3 = await myFile.write(buffer);
   * ```
   */
  async write(
    data: string | BufferSource,
    options?: { at?: number },
  ): Promise<number> {
    const content =
      typeof data === "string" ? this.textEncoder.encode(data) : data;
    const at = options?.at ?? this.prevWriteOffset;
    const result = await fileWorker.send("write", this.fullPath, content, {
      ...options,
      at,
    });
    this.prevWriteOffset = at + content.byteLength;
    return result;
  }

  /**
   * Truncate file
   *
   * Truncate the file to the specified size. If the new size is smaller than the current size, excess data is removed.
   * If the new size is larger than the current size, the file is extended and new parts are filled with zeros.
   *
   * @param newSize - New file size (in bytes)
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when truncation fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   *
   * // Truncate to 100 bytes
   * await myFile.truncate(100);
   *
   * // Extend file to 1000 bytes
   * await myFile.truncate(1000);
   * ```
   */
  async truncate(newSize: number): Promise<void> {
    await fileWorker.send("truncate", this.fullPath, newSize);
    if (this.prevWriteOffset > newSize) this.prevWriteOffset = newSize;
  }

  /**
   * Flush file buffer
   *
   * Force data in the file buffer to be written to disk, ensuring data persistence.
   *
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when flush fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   * await myFile.write("Important data");
   * await myFile.flush(); // Ensure data is written to disk
   * ```
   */
  flush(): Promise<void> {
    return fileWorker.send("flush", this.fullPath);
  }

  /**
   * Get file size
   *
   * Returns the current size of the file (in bytes).
   *
   * @returns Promise<number> - File size (in bytes)
   * @throws {DOMException} Throws corresponding exception when getting size fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const size = await myFile.getSize();
   * console.log(`File size: ${size} bytes`);
   * ```
   */
  getSize(): Promise<number> {
    return fileWorker.send("getSize", this.fullPath);
  }

  /**
   * Close file
   *
   * Close the file handle and release related resources. This method should be called after completing file operations.
   *
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when closing fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   * await myFile.write("Data");
   * await myFile.close(); // Close file
   * ```
   */
  async close(): Promise<void> {
    return fileWorker.send("close", this.fullPath);
  }

  /**
   * Read file content as text
   *
   * Read the entire file content as a UTF-8 encoded string.
   *
   * @returns Promise<string> - Text content of the file
   * @throws {DOMException} Throws corresponding exception when reading fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const content = await myFile.text();
   * console.log(content); // Output file content
   * ```
   */
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  /**
   * Read file content as ArrayBuffer
   *
   * Read the entire file content as an ArrayBuffer object.
   *
   * @returns Promise<ArrayBuffer> - Binary content of the file
   * @throws {DOMException} Throws corresponding exception when reading fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.bin");
   * const buffer = await myFile.arrayBuffer();
   * const view = new Uint8Array(buffer);
   * console.log(view); // Output binary data
   * ```
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const file = await this.getFile();
    return file?.arrayBuffer() || new ArrayBuffer(0);
  }

  /**
   * Get file stream
   *
   * Returns a ReadableStream for streaming file content.
   * Suitable for processing large files to avoid loading everything into memory at once.
   *
   * @returns Promise<ReadableStream<BufferSource>> - File stream
   * @throws {DOMException} Throws corresponding exception when getting stream fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/largefile.txt");
   * const stream = await myFile.stream();
   * const reader = stream.getReader();
   *
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   console.log(new TextDecoder().decode(value));
   * }
   * ```
   */
  async stream(): Promise<ReadableStream<BufferSource>> {
    const file = await this.getFile();
    return (
      file?.stream() ||
      new ReadableStream({
        pull(controller) {
          controller.close();
        },
      })
    );
  }

  /**
   * Get native File object
   *
   * Returns the browser's native File object, which can be used to interact with other Web APIs.
   *
   * @returns Promise<File | undefined> - Native File object, returns undefined if file doesn't exist
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const nativeFile = await myFile.getFile();
   *
   * if (nativeFile) {
   *   // Use native File object
   *   console.log(nativeFile.name);
   *   console.log(nativeFile.size);
   *   console.log(nativeFile.type);
   * }
   * ```
   */
  async getFile(): Promise<File | undefined> {
    return (
      await getFileSystemHandle(this.fullPath, {
        create: false,
        isFile: true,
      })
    )?.getFile();
  }

  /**
   * Copy file to destination
   *
   * Copy the file to the specified destination. Supports copying to FileSystemHandle, OPFS objects or string paths.
   * If destination is a directory, file will be copied into that directory; if destination is a file path, file will be copied and renamed.
   * Throws exception if target file already exists.
   *
   * @param dest - Destination, can be FileSystemHandle, OPFS object or string path
   * @returns Promise<void>
   * @throws {DOMException} Throws NotFoundError when source file does not exist
   * @throws {DOMException} Throws AlreadyExistsError when target file already exists
   * @throws {DOMException} Throws NotSupportedError when target handle type is not supported
   * @example
   * ```typescript
   * const sourceFile = file("/path/to/source.txt");
   *
   * // Copy to string path (supports renaming)
   * await sourceFile.copyTo("/path/to/destination.txt");
   *
   * // Copy to directory
   * await sourceFile.copyTo("/path/to/directory");
   *
   * // Copy to another OPFile object
   * const destFile = file("/path/to/destination.txt");
   * await sourceFile.copyTo(destFile);
   *
   * // Copy to OPDir object
   * const destDir = dir("/path/to/directory");
   * await sourceFile.copyTo(destDir);
   *
   * // Copy to FileSystemDirectoryHandle
   * const handle = await navigator.storage.getDirectory();
   * await sourceFile.copyTo(handle);
   * ```
   */
  async copyTo(dest: FileSystemHandle | OPFS | string): Promise<void> {
    if (!(await this.exists()))
      throw new DOMException("Source file does not exist", "NotFoundError");

    let targetDir: FileSystemDirectoryHandle;
    let targetName: string = this.name;

    if (dest instanceof FileSystemDirectoryHandle) {
      // Explicit directory handle
      targetDir = dest;
    } else if (dest instanceof FileSystemFileHandle) {
      // Strict no-overwrite: Target file handle must already exist, directly throw error
      throw new DOMException(
        "Target file already exists",
        "AlreadyExistsError",
      );
    } else if (dest instanceof FileSystemHandle) {
      throw new DOMException("Unsupported handle type", "NotSupportedError");
    } else if (dest instanceof OPFS) {
      // OPFS object: Directory → copy to this directory; File → supports renaming, throws error if already exists
      if (dest.kind === "directory") {
        targetDir = (await getFileSystemHandle(dest.fullPath, {
          create: true,
          isFile: false,
        })) as FileSystemDirectoryHandle;
      } else {
        if (await dest.exists())
          throw new DOMException(
            "Target file already exists",
            "AlreadyExistsError",
          );
        const { parents, name } = parsePath(dest.fullPath);
        targetDir = (await getFileSystemHandle("/" + parents.join("/"), {
          create: true,
          isFile: false,
        })) as FileSystemDirectoryHandle;
        if (name) targetName = name;
      }
    } else {
      // String path: If path exists as directory, copy to this directory; otherwise treat as "file path" (supports renaming)
      const { fullPath, parents, name } = parsePath(dest);
      const existingDir = (await getFileSystemHandle(fullPath, {
        create: false,
        isFile: false,
      })) as FileSystemDirectoryHandle | null;
      if (existingDir) {
        targetDir = existingDir;
      } else {
        targetDir = (await getFileSystemHandle("/" + parents.join("/"), {
          create: true,
          isFile: false,
        })) as FileSystemDirectoryHandle;
        if (name) targetName = name;
      }
    }

    const targetFile = await targetDir.getFileHandle(targetName, {
      create: true,
    });
    await (await this.stream()).pipeTo(await targetFile.createWritable());
  }
}
