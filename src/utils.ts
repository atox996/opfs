export const parsePath = (
  path = "/",
): {
  name?: string;
  parents: string[];
  fullPath: string;
} => {
  // 1) Normalize string and remove extra whitespace
  path = String(path || "/").trim();

  // 2) Split and filter empty segments
  const raw = path.split("/").filter((s) => s.length > 0);

  // 3) 处理 . 与 .. 段，并折叠多余分隔
  const stack: string[] = [];
  for (const seg of raw) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(seg);
  }

  // 4) 生成规范化绝对路径（根为 "/"），去掉尾随斜杠
  const fullPath = stack.length ? `/${stack.join("/")}` : "/";

  // 5) 导出 name 与 parents
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
 * 根据指定并发数量创建 Promise 池
 *
 * 功能：
 * - 不会立即执行 Promise
 * - 返回一个数组，每个元素是一个 async 函数，执行时会按顺序从任务列表取任务
 * - 外部可以自由使用 Promise.all / Promise.allSettled 等来执行
 *
 * @param tasks - 返回 Promise 的函数数组
 * @param concurrency - 最大并发数量（可选，默认 5）
 * @returns Promise 数组，由外部控制执行
 */
export function createPromisePool<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency = 5,
): Promise<void>[] {
  // 创建一个迭代器，用于顺序取任务
  const iterator = tasks[Symbol.iterator]();

  // 每个“池”函数，从迭代器中取任务执行
  async function poolTask() {
    for (;;) {
      const next = iterator.next();
      if (next.done) break;
      await next.value();
    }
  }

  // 根据并发数量创建 Promise 池
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
