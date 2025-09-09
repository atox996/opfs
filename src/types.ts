// ------------------ Worker Types ------------------
export type WorkerAction =
  | "open"
  | "read"
  | "write"
  | "getSize"
  | "truncate"
  | "flush"
  | "close";

export interface WorkerActionArgs {
  open: [options?: FileSystemSyncAccessHandleOptions];
  read: [buffer: BufferSource, options?: { at?: number }];
  write: [buffer: BufferSource, options?: { at?: number }];
  truncate: [newSize: number];
  flush: [];
  getSize: [];
  close: [];
}

export interface WorkerActionResult {
  open: void;
  read: ArrayBuffer;
  write: number;
  truncate: void;
  flush: void;
  getSize: number;
  close: void;
}

// ------------------ Worker Request / Response ------------------
export type WorkerRequest = {
  [A in WorkerAction]: {
    id: string;
    action: A;
    path: string;
    args: WorkerActionArgs[A];
  };
}[WorkerAction];

export type WorkerResponse = {
  [A in WorkerAction]: {
    id: string;
    action: A;
    result?: WorkerActionResult[A];
    error?: { message: string; name: string };
  };
}[WorkerAction];

// ------------------ Actions mapping types ------------------
export type WorkerActionsMap = {
  [A in Exclude<WorkerAction, "open">]: (
    ah: FileSystemSyncAccessHandle,
    args: WorkerActionArgs[A],
    path?: string,
  ) => WorkerActionResult[A];
};

// Optional Deferred type (if used)
export type Deferred<T> = Pick<PromiseWithResolvers<T>, "resolve" | "reject">;
