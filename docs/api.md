# API

The "@atox/opfs" library provides three entry functions: "file," "write," and "dir," for accessing files and directories.

```ts
import { file, write, dir, type OTFile, type OTDir } from "@atox/opfs";
```

## file

````ts
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
const file: (path: string) => OPFile;
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
const write: (
  target: string | OPFile,
  data: string | BufferSource | ReadableStream<BufferSource> | OPFile,
  overwrite?: boolean,
) => Promise<void>;
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
class OPFile extends OPFS {
  /** File type identifier */
  readonly kind = "file";
  /** Text encoder for converting strings to bytes */
  private textEncoder;
  /** Offset of the last write operation */
  private prevWriteOffset;
  /** Offset of the last read operation */
  private prevReadOffset;
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
  open(options?: FileSystemSyncAccessHandleOptions): Promise<void>;
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
  read(
    size: number | BufferSource,
    options?: {
      at?: number;
    },
  ): Promise<ArrayBuffer>;
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
  write(
    data: string | BufferSource,
    options?: {
      at?: number;
    },
  ): Promise<number>;
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
  truncate(newSize: number): Promise<void>;
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
  flush(): Promise<void>;
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
  getSize(): Promise<number>;
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
  close(): Promise<void>;
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
  text(): Promise<string>;
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
  arrayBuffer(): Promise<ArrayBuffer>;
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
  stream(): Promise<ReadableStream<BufferSource>>;
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
  getFile(): Promise<File | undefined>;
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
  copyTo(dest: FileSystemHandle | OPFS | string): Promise<void>;
}
````

## directory

````ts
/**
 * Create directory object
 *
 * Factory function for creating OPDir instances. This is the recommended way to create directory objects.
 *
 * @param path - Directory path
 * @returns OPDir - Directory object instance
 * @example
 * ```typescript
 * const myDir = dir("/path/to/directory");
 * await myDir.create(); // Create directory
 *
 * // Check if directory exists
 * if (await myDir.exists()) {
 *   console.log("Directory exists");
 * }
 * ```
 */
function dir(path: string): OPDir;
/**
 * Directory class
 *
 * Inherits from OPFS abstract class, provides directory-related operation functionality.
 * Includes operations such as getting children, copying directories, etc.
 *
 * @example
 * ```typescript
 * const myDir = dir("/path/to/directory");
 *
 * // Get all children in directory
 * const children = await myDir.children();
 *
 * // Copy entire directory
 * await myDir.copyTo("/path/to/destination");
 * ```
 */
class OPDir extends OPFS {
  /** Directory type identifier */
  readonly kind = "directory";
  /**
   * Get all children in directory
   *
   * Returns an array of OPFS objects for all files and subdirectories in the directory.
   * If the directory does not exist, returns an empty array.
   *
   * @returns Promise<OPFS[]> - Array of children, containing file and directory objects
   * @example
   * ```typescript
   * const myDir = dir("/path/to/directory");
   * const children = await myDir.children();
   *
   * for (const child of children) {
   *   if (child.kind === "file") {
   *     console.log(`File: ${child.name}`);
   *   } else {
   *     console.log(`Directory: ${child.name}`);
   *   }
   * }
   * ```
   */
  children(): Promise<OPFS[]>;
  /**
   * Copy directory to destination
   *
   * Recursively copy the entire directory and all its contents to the destination.
   * Supports copying to FileSystemDirectoryHandle, OPDir objects or string paths.
   * If the target directory already exists, an exception will be thrown.
   *
   * @param dest - Destination, can be FileSystemDirectoryHandle, OPDir object or string path
   * @returns Promise<void>
   * @throws {DOMException} Throws NotFoundError when source directory does not exist
   * @throws {DOMException} Throws AlreadyExistsError when target directory already exists
   * @example
   * ```typescript
   * const sourceDir = dir("/path/to/source");
   *
   * // Copy to string path
   * await sourceDir.copyTo("/path/to/destination");
   *
   * // Copy to another OPDir object
   * const destDir = dir("/path/to/destination");
   * await sourceDir.copyTo(destDir);
   *
   * // Copy to FileSystemDirectoryHandle
   * const handle = await navigator.storage.getDirectory();
   * await sourceDir.copyTo(handle);
   * ```
   */
  copyTo(dest: FileSystemDirectoryHandle | OPDir | string): Promise<void>;
}
````

## OPFS

````ts
/**
 * OPFS (Origin Private File System) Abstract Base Class
 *
 * Provides basic file system operations including create, check existence, delete, copy and move operations.
 * This is an abstract class that needs to be implemented by subclasses (OPFile or OPDir) for specific file or directory operations.
 *
 * @abstract
 * @example
 * ```typescript
 * // Cannot instantiate OPFS directly, use file() or dir() functions
 * const myFile = file("/path/to/file.txt");
 * const myDir = dir("/path/to/directory");
 * ```
 */
abstract class OPFS {
  /** Complete file system path */
  readonly fullPath: string;
  /** Name of the file or directory */
  readonly name: string;
  /** Parent directory path array */
  protected readonly parents: string[];
  /** Type of file system object: file or directory */
  abstract readonly kind: "file" | "directory";
  /**
   * Constructor
   * @param path - Path of the file or directory
   */
  constructor(path: string);
  /**
   * Create file or directory
   *
   * Create a file or directory at the specified path. If the parent directory does not exist, it will be created automatically.
   *
   * @returns Promise<this> - Returns the current instance, supports chaining
   * @throws {DOMException} Throws exception when creation fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/newfile.txt");
   * await myFile.create(); // Create file
   *
   * const myDir = dir("/path/to/newdir");
   * await myDir.create(); // Create directory
   * ```
   */
  create(): Promise<this>;
  /**
   * Check if file or directory exists
   *
   * Asynchronously check if the file or directory at the specified path exists.
   *
   * @returns Promise<boolean> - Returns true if exists, false otherwise
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * if (await myFile.exists()) {
   *   console.log("File exists");
   * } else {
   *   console.log("File does not exist");
   * }
   * ```
   */
  exists(): Promise<boolean>;
  /**
   * Delete file or directory
   *
   * Delete the specified file or directory. For directories, all children will be recursively deleted.
   * Uses Promise.allSettled to ensure that even if some delete operations fail, other operations will continue to execute.
   *
   * @returns Promise<PromiseSettledResult<void>[]> - Returns array of all delete operation results
   * @throws {DOMException} Throws NotFoundError when parent directory does not exist
   * @example
   * ```typescript
   * const myFile = file("/path/to/file.txt");
   * const results = await myFile.remove();
   *
   * const myDir = dir("/path/to/directory");
   * const results = await myDir.remove(); // Recursively delete directory and all contents
   *
   * // Check delete results
   * results.forEach((result, index) => {
   *   if (result.status === 'rejected') {
   *     console.error(`Delete operation ${index} failed:`, result.reason);
   *   }
   * });
   * ```
   */
  remove(): Promise<PromiseSettledResult<void>[]>;
  /**
   * Copy file or directory to destination
   *
   * Abstract method that needs to be implemented by subclasses for specific copy logic.
   * Supports copying to FileSystemHandle, OPFS objects or string paths.
   *
   * @abstract
   * @param dest - Destination, can be FileSystemHandle, OPFS object or string path
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when copy fails
   */
  abstract copyTo(dest: FileSystemHandle | OPFS | string): Promise<void>;
  /**
   * Move file or directory to destination
   *
   * First copy to destination, then delete the source file or directory.
   * This is a combined operation, equivalent to copyTo + remove.
   *
   * @param dest - Destination, can be FileSystemHandle, OPFS object or string path
   * @returns Promise<void>
   * @throws {DOMException} Throws corresponding exception when move fails
   * @example
   * ```typescript
   * const myFile = file("/path/to/source.txt");
   * await myFile.moveTo("/path/to/destination.txt"); // Move and rename
   *
   * const myDir = dir("/path/to/source");
   * await myDir.moveTo("/path/to/destination"); // Move directory
   * ```
   */
  moveTo(dest: FileSystemHandle | OPFS | string): Promise<void>;
}
````
