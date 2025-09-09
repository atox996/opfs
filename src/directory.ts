import { file } from "./file";
import { OPFS } from "./opfs";
import { createPromisePool, getFileSystemHandle, parsePath } from "./utils";

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
export function dir(path: string): OPDir {
  return new OPDir(path);
}

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
export class OPDir extends OPFS {
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
  async children(): Promise<OPFS[]> {
    const handle = await getFileSystemHandle(this.fullPath, {
      create: false,
      isFile: false,
    });
    if (!handle) return [];
    const children = [];
    for await (const entry of handle.values()) {
      if (entry.kind === "file") {
        children.push(file(`${this.fullPath}/${entry.name}`));
      } else {
        children.push(dir(`${this.fullPath}/${entry.name}`));
      }
    }
    return children;
  }

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
  async copyTo(
    dest: FileSystemDirectoryHandle | OPDir | string,
  ): Promise<void> {
    if (!(await this.exists()))
      throw new DOMException(
        "Source directory does not exist",
        "NotFoundError",
      );

    let handle: FileSystemDirectoryHandle;
    if (dest instanceof FileSystemDirectoryHandle) {
      handle = dest;
    } else if (dest instanceof OPDir) {
      if (await dest.exists())
        throw new DOMException(
          "Target directory already exists",
          "AlreadyExistsError",
        );
      handle = await getFileSystemHandle(dest.fullPath, {
        create: true,
        isFile: false,
      });
    } else {
      const { fullPath } = parsePath(dest);
      const existing = await getFileSystemHandle(fullPath, {
        create: false,
        isFile: false,
      });
      if (existing)
        throw new DOMException(
          "Target directory already exists",
          "AlreadyExistsError",
        );
      handle = await getFileSystemHandle(fullPath, {
        create: true,
        isFile: false,
      });
    }
    const tasks = [];
    for (const entry of await this.children()) {
      tasks.push(async () => {
        if (entry.kind === "file") {
          await entry.copyTo(handle);
        } else {
          const childDestHandle = await handle.getDirectoryHandle(entry.name, {
            create: true,
          });
          await entry.copyTo(childDestHandle);
        }
      });
    }
    await Promise.allSettled(createPromisePool(tasks));
  }
}
