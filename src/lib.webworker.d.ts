/**
 * Synchronous access mode types
 */
type FileSystemSyncAccessMode = 'read-only' | 'readwrite' | 'readwrite-unsafe';

/**
 * Parameter types for createSyncAccessHandle
 */
interface FileSystemSyncAccessHandleOptions {
  /** 锁定模式，默认 "readwrite" */
  mode?: FileSystemSyncAccessMode;
}

/**
 * 代表一个同步访问的文件句柄，提供高性能读写操作。
 */
interface FileSystemSyncAccessHandle {
  /**
   * 从文件中读取内容到指定缓冲区。
   *
   * @param buffer 用于存储数据的缓冲区（BufferSource，如 Uint8Array、DataView 等）。
   *               注意：不能直接操作 ArrayBuffer，应通过类型化数组访问。
   * @param options 可选对象：
   *   - at: number，从文件指定字节偏移开始读取
   * @returns 实际读取的字节数
   * @throws InvalidStateError 如果访问句柄已关闭
   * @throws TypeError 如果底层文件系统不支持从指定偏移读取
   */
  read(buffer: BufferSource, options?: { at?: number }): number;

  /**
   * 将指定缓冲区的数据写入文件。
   *
   * @param buffer 用于写入文件的数据（BufferSource，如 Uint8Array、DataView 等）
   * @param options 可选对象：
   *   - at: number，从文件指定字节偏移开始写入
   * @returns 实际写入的字节数
   * @throws InvalidStateError 如果访问句柄已关闭或文件数据修改失败
   * @throws QuotaExceededError 如果写入后超出浏览器存储配额
   * @throws TypeError 如果底层文件系统不支持从指定偏移写入
   */
  write(buffer: BufferSource, options?: { at?: number }): number;

  /**
   * 获取文件的字节大小。
   *
   * @returns 文件字节大小
   * @throws InvalidStateError 如果访问句柄已关闭
   */
  getSize(): number;

  /**
   * 将文件截断或扩展到指定大小。
   *
   * @param newSize 文件调整后的字节大小
   * @returns void
   * @throws InvalidStateError 如果访问句柄已关闭或文件修改失败
   * @throws QuotaExceededError 如果 newSize 超出浏览器存储配额
   * @throws TypeError 如果底层文件系统不支持调整文件大小
   */
  truncate(newSize: number): void;

  /**
   * 将写入缓冲区的内容持久化到存储。
   *
   * @returns void
   * @throws InvalidStateError 如果访问句柄已关闭
   */
  flush(): void;

  /**
   * 关闭句柄并释放锁资源。
   *
   * @returns void
   */
  close(): void;
}

/**
 * 文件句柄对象，扩展 FileSystemHandle。
 */
interface FileSystemFileHandle extends FileSystemHandle {
  /**
   * 创建同步访问句柄（FileSystemSyncAccessHandle）。
   *
   * @param options 可选对象：
   *   - mode: 同步访问锁定模式，默认 "readwrite"
   *       - "read-only": 只读模式，可多开句柄，只能调用 read(), getSize(), close() 等方法
   *       - "readwrite": 独占读写模式，每个文件同时只能有一个句柄
   *       - "readwrite-unsafe": 非独占读写模式，可多开句柄，但写入可能不一致
   * @returns 返回同步访问句柄
   * @throws NotAllowedError 如果在 readwrite 模式下权限未授予
   * @throws InvalidStateError 如果句柄不在源私有文件系统
   * @throws NotFoundError 如果文件未找到
   * @throws NoModificationAllowedError 如果在 readwrite 模式下尝试同时打开多个句柄
   */
  createSyncAccessHandle(options?: FileSystemSyncAccessHandleOptions): Promise<FileSystemSyncAccessHandle>;
}
