import { createPromisePool, getFileSystemHandle, parsePath } from "./utils";

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
export abstract class OPFS {
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
  constructor(path: string) {
    const { fullPath, name, parents } = parsePath(path);
    this.fullPath = fullPath;
    this.name = name || "";
    this.parents = parents;
  }

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
  async create(): Promise<this> {
    await getFileSystemHandle(this.fullPath, {
      create: true,
      isFile: this.kind === "file",
    });
    return this;
  }

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
  async exists(): Promise<boolean> {
    return (
      (await getFileSystemHandle(this.fullPath, {
        create: false,
        isFile: this.kind === "file",
      })) !== null
    );
  }

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
  async remove(): Promise<PromiseSettledResult<void>[]> {
    const parentPath = this.parents.join("/");
    const parentHandle = await getFileSystemHandle(parentPath, {
      create: false,
      isFile: false,
    });
    if (!parentHandle)
      throw new DOMException(
        `Parent directory "${parentPath}" of ${this.kind} "${this.name}" does not exist`,
        "NotFoundError",
      );

    const tasks = [];

    // root
    if (this.name === "") {
      for await (const entry of parentHandle.keys()) {
        tasks.push(() => parentHandle.removeEntry(entry, { recursive: true }));
      }
    } else {
      tasks.push(() =>
        parentHandle.removeEntry(this.name, { recursive: true }),
      );
    }
    return Promise.allSettled(createPromisePool(tasks));
  }

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
  async moveTo(dest: FileSystemHandle | OPFS | string): Promise<void> {
    await this.copyTo(dest);
    await this.remove();
  }
}
