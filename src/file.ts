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
   * 打开文件
   *
   * 打开文件以进行同步访问操作。必须在进行读写操作之前调用此方法。
   * 使用 Web Worker 进行异步操作，避免阻塞主线程。
   *
   * @param options - 文件系统同步访问句柄选项
   * @returns Promise<void>
   * @throws {DOMException} 当文件打开失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   *
   * // 以读写模式打开文件
   * await myFile.open({ mode: "readwrite" });
   *
   * // 以只读模式打开文件
   * await myFile.open({ mode: "readonly" });
   * ```
   */
  async open(options?: FileSystemSyncAccessHandleOptions): Promise<void> {
    fileWorker.open();
    return fileWorker.send("open", this.fullPath, options);
  }
  /**
   * 从文件读取数据
   *
   * 从文件的指定位置读取指定大小的数据。如果不指定位置，会从上次读取的位置继续。
   *
   * @param size - 要读取的字节数，或提供预分配的缓冲区
   * @param options - 读取选项
   * @param options.at - 读取的起始位置，如果不指定则从上次读取位置继续
   * @returns Promise<ArrayBuffer> - 读取到的数据
   * @throws {DOMException} 当读取失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readonly" });
   *
   * // 读取 1024 字节
   * const data1 = await myFile.read(1024);
   *
   * // 从指定位置读取
   * const data2 = await myFile.read(512, { at: 0 });
   *
   * // 使用预分配的缓冲区
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
   * 向文件写入数据
   *
   * 向文件的指定位置写入数据。如果不指定位置，会从上次写入的位置继续。
   * 支持写入字符串或二进制数据。
   *
   * @param data - 要写入的数据，可以是字符串或 BufferSource
   * @param options - 写入选项
   * @param options.at - 写入的起始位置，如果不指定则从上次写入位置继续
   * @returns Promise<number> - 实际写入的字节数
   * @throws {DOMException} 当写入失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   *
   * // 写入字符串
   * const bytesWritten1 = await myFile.write("Hello, World!");
   *
   * // 从指定位置写入
   * const bytesWritten2 = await myFile.write("追加内容", { at: 0 });
   *
   * // 写入二进制数据
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
   * 截断文件
   *
   * 将文件截断到指定大小。如果新大小小于当前大小，超出部分会被删除。
   * 如果新大小大于当前大小，文件会被扩展，新增部分用零填充。
   *
   * @param newSize - 新的文件大小（字节数）
   * @returns Promise<void>
   * @throws {DOMException} 当截断失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   *
   * // 截断到 100 字节
   * await myFile.truncate(100);
   *
   * // 扩展文件到 1000 字节
   * await myFile.truncate(1000);
   * ```
   */
  async truncate(newSize: number): Promise<void> {
    await fileWorker.send("truncate", this.fullPath, newSize);
    if (this.prevWriteOffset > newSize) this.prevWriteOffset = newSize;
  }

  /**
   * 刷新文件缓冲区
   *
   * 将文件缓冲区中的数据强制写入到磁盘，确保数据持久化。
   *
   * @returns Promise<void>
   * @throws {DOMException} 当刷新失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   * await myFile.write("重要数据");
   * await myFile.flush(); // 确保数据写入磁盘
   * ```
   */
  flush(): Promise<void> {
    return fileWorker.send("flush", this.fullPath);
  }

  /**
   * 获取文件大小
   *
   * 返回文件的当前大小（字节数）。
   *
   * @returns Promise<number> - 文件大小（字节数）
   * @throws {DOMException} 当获取大小失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const size = await myFile.getSize();
   * console.log(`文件大小: ${size} 字节`);
   * ```
   */
  getSize(): Promise<number> {
    return fileWorker.send("getSize", this.fullPath);
  }

  /**
   * 关闭文件
   *
   * 关闭文件句柄，释放相关资源。在完成文件操作后应该调用此方法。
   *
   * @returns Promise<void>
   * @throws {DOMException} 当关闭失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * await myFile.open({ mode: "readwrite" });
   * await myFile.write("数据");
   * await myFile.close(); // 关闭文件
   * ```
   */
  async close(): Promise<void> {
    return fileWorker.send("close", this.fullPath);
  }

  /**
   * 读取文件内容为文本
   *
   * 将整个文件内容读取为 UTF-8 编码的字符串。
   *
   * @returns Promise<string> - 文件的文本内容
   * @throws {DOMException} 当读取失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const content = await myFile.text();
   * console.log(content); // 输出文件内容
   * ```
   */
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  /**
   * 读取文件内容为 ArrayBuffer
   *
   * 将整个文件内容读取为 ArrayBuffer 对象。
   *
   * @returns Promise<ArrayBuffer> - 文件的二进制内容
   * @throws {DOMException} 当读取失败时抛出相应异常
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.bin");
   * const buffer = await myFile.arrayBuffer();
   * const view = new Uint8Array(buffer);
   * console.log(view); // 输出二进制数据
   * ```
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const file = await this.getFile();
    return file?.arrayBuffer() || new ArrayBuffer(0);
  }

  /**
   * 获取文件流
   *
   * 返回一个 ReadableStream，用于流式读取文件内容。
   * 适用于处理大文件，避免一次性加载到内存中。
   *
   * @returns Promise<ReadableStream<BufferSource>> - 文件流
   * @throws {DOMException} 当获取流失败时抛出相应异常
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
   * 获取原生 File 对象
   *
   * 返回浏览器原生的 File 对象，可以用于与其他 Web API 交互。
   *
   * @returns Promise<File | undefined> - 原生 File 对象，如果文件不存在则返回 undefined
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const nativeFile = await myFile.getFile();
   *
   * if (nativeFile) {
   *   // 使用原生 File 对象
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
   * 复制文件到目标位置
   *
   * 将文件复制到指定的目标位置。支持复制到 FileSystemHandle、OPFS 对象或字符串路径。
   * 如果目标是目录，文件会被复制到该目录中；如果目标是文件路径，文件会被复制并重命名。
   * 如果目标文件已存在，会抛出异常。
   *
   * @param dest - 目标位置，可以是 FileSystemHandle、OPFS 对象或字符串路径
   * @returns Promise<void>
   * @throws {DOMException} 当源文件不存在时抛出 NotFoundError
   * @throws {DOMException} 当目标文件已存在时抛出 AlreadyExistsError
   * @throws {DOMException} 当目标句柄类型不支持时抛出 NotSupportedError
   * @example
   * ```typescript
   * const sourceFile = file("/path/to/source.txt");
   *
   * // 复制到字符串路径（支持重命名）
   * await sourceFile.copyTo("/path/to/destination.txt");
   *
   * // 复制到目录
   * await sourceFile.copyTo("/path/to/directory");
   *
   * // 复制到另一个 OPFile 对象
   * const destFile = file("/path/to/destination.txt");
   * await sourceFile.copyTo(destFile);
   *
   * // 复制到 OPDir 对象
   * const destDir = dir("/path/to/directory");
   * await sourceFile.copyTo(destDir);
   *
   * // 复制到 FileSystemDirectoryHandle
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
      // 显式目录句柄
      targetDir = dest;
    } else if (dest instanceof FileSystemFileHandle) {
      // 严格不覆盖：目标文件句柄必然已存在，直接报错
      throw new DOMException(
        "Target file already exists",
        "AlreadyExistsError",
      );
    } else if (dest instanceof FileSystemHandle) {
      throw new DOMException("Unsupported handle type", "NotSupportedError");
    } else if (dest instanceof OPFS) {
      // OPFS 对象：目录 → 复制到该目录；文件 → 支持重命名，若已存在则报错
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
      // 字符串路径：若该路径存在为目录，则复制到该目录；否则作为"文件路径"处理（支持重命名）
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
