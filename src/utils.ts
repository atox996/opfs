export const parsePath = (
  path = "/",
): {
  name?: string;
  parents: string[];
  fullPath: string;
} => {
  // Normalize the string and remove extra whitespace
  path = String(path || "/").trim();

  // Split the path and filter out empty segments
  const raw = path.split("/").filter((s) => s.length > 0);

  // Process '.' and '..' segments and collapse redundant separators
  const stack: string[] = [];
  for (const seg of raw) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(seg);
  }

  // Generate normalized absolute path (root is "/") and remove trailing slash
  const fullPath = stack.length ? `/${stack.join("/")}` : "/";

  // Extract the name and parent segments
  const name = stack.at(-1);
  const parents = stack.length ? stack.slice(0, -1) : [];

  return { name, parents, fullPath };
};

export async function getFileSystemHandle<
  ISFile extends boolean,
  ISCreate extends boolean,
  T = ISFile extends true ? FileSystemFileHandle : FileSystemDirectoryHandle,
  RT = ISCreate extends true ? T : T | null,
>(
  path: string,
  opts: {
    create: ISCreate;
    isFile: ISFile;
  },
  root?: FileSystemDirectoryHandle,
): Promise<RT> {
  const { parents, name } = parsePath(path);
  root = root || (await navigator.storage.getDirectory());
  if (name === undefined) return root as RT;

  try {
    for (const p of parents) {
      root = await root.getDirectoryHandle(p, {
        create: opts.create,
      });
    }
    if (opts.isFile) {
      return (await root.getFileHandle(name, {
        create: opts.create,
      })) as RT;
    }
    return (await root.getDirectoryHandle(name, {
      create: opts.create,
    })) as RT;
  } catch (err) {
    if ((err as Error).name === "NotFoundError") {
      return null as RT;
    }
    throw err;
  }
}

/**
 * Create Promise pool with specified concurrency
 *
 * Features:
 * - Does not execute Promises immediately
 * - Returns an array where each element is an async function that sequentially takes tasks from the task list when executed
 * - Externally can freely use Promise.all / Promise.allSettled to execute
 *
 * @param tasks - Array of functions that return Promise
 * @param concurrency - Maximum concurrency (optional, default 5)
 * @returns Array of Promise, controlled by external execution
 */
export function createPromisePool<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency = 5,
): Promise<void>[] {
  // Create an iterator for sequentially fetching tasks
  const iterator = tasks[Symbol.iterator]();

  // Each "pool" function fetches tasks from the iterator and executes them
  async function poolTask() {
    for (;;) {
      const next = iterator.next();
      if (next.done) break;
      await next.value();
    }
  }

  // Create Promise pool according to concurrency number
  return Array(Math.min(concurrency, tasks.length))
    .fill(0)
    .map(() => poolTask());
}

export const createGenerateUniqueId = (): (() => string) => {
  if (typeof crypto?.randomUUID === "function") {
    return () => crypto.randomUUID();
  }
  return () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const uuid: () => string = createGenerateUniqueId();

export const collectTransferables = (
  ...args: unknown[]
): Transferable[] | undefined => {
  const transfer: Transferable[] = [];
  for (const a of args) {
    if (a instanceof ArrayBuffer) transfer.push(a);
    else if (ArrayBuffer.isView(a)) transfer.push(a.buffer);
  }
  if (transfer.length) return transfer;
};

export const bufferTransfer = (
  buffer: BufferSource,
  newSize: number,
): ArrayBuffer => {
  if (buffer instanceof ArrayBuffer) {
    return buffer.transfer?.(newSize) ?? buffer.slice(0, newSize);
  }

  const buf = buffer.buffer as ArrayBuffer;

  return bufferTransfer(buf, newSize);
};
