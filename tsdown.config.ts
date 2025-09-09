import { defineConfig, type UserConfigFn } from "tsdown";

export default defineConfig((options) => {
  const { sourcemap = !!options.watch, minify = !options.watch } = options;
  return {
    platform: "neutral",
    minify,
    sourcemap,
    ...options,
    entry: ["src/index.ts", "src/file.worker.js"],
  };
}) satisfies UserConfigFn as UserConfigFn;
