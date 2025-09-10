# opfs.js

英文文档请查看 [README.md](https://github.com/atox996/opfs/blob/main/README.md)。

一个现代化的 TypeScript 库，用于在 Web 浏览器中操作 Origin Private File System (OPFS)。提供简洁的基于 Promise 的 API 进行文件和目录操作。

## 特性

- 🚀 **现代化 API**: 简洁的基于 Promise 的接口
- 📁 **文件操作**: 创建、读取、写入、删除文件
- 📂 **目录操作**: 创建、列出、复制、移动目录
- 🔄 **流支持**: 内置 ReadableStream 支持
- 🛡️ **类型安全**: 完整的 TypeScript 支持，包含全面的类型定义
- ⚡ **高性能**: 使用 Web Workers 进行非阻塞文件操作
- 🌐 **浏览器原生**: 基于 OPFS API 构建

## 安装

```bash
npm install opfs.js
# 或
pnpm add opfs.js
# 或
yarn add opfs.js
```

## API 文档

详细的 API 文档，请参阅 [https://atox996.github.io/opfs/](https://atox996.github.io/opfs/)。

### 核心函数

#### `file(path: string): OPFile`

为指定路径创建文件对象。

#### `dir(path: string): OPDir`

为指定路径创建目录对象。

#### `write(target: string | OPFile, data: string | BufferSource | ReadableStream | OPFile, overwrite?: boolean): Promise<void>`

便捷函数，用于将数据写入文件。

### 文件操作

#### `OPFile` 类

- `create()`: 创建文件
- `exists()`: 检查文件是否存在
- `open(options?)`: 打开文件进行同步访问
- `read(size, options?)`: 从文件读取数据
- `write(data, options?)`: 向文件写入数据
- `truncate(newSize)`: 将文件截断到指定大小
- `flush()`: 将文件缓冲区刷新到磁盘
- `getSize()`: 获取文件大小（字节）
- `close()`: 关闭文件句柄
- `text()`: 将整个文件读取为文本
- `arrayBuffer()`: 将整个文件读取为 ArrayBuffer
- `stream()`: 获取文件作为 ReadableStream
- `getFile()`: 获取原生 File 对象
- `copyTo(dest)`: 复制文件到目标位置
- `moveTo(dest)`: 移动文件到目标位置
- `remove()`: 删除文件

### 目录操作

#### `OPDir` 类

- `create()`: 创建目录
- `exists()`: 检查目录是否存在
- `children()`: 获取所有子项（文件和子目录）
- `copyTo(dest)`: 复制目录到目标位置
- `moveTo(dest)`: 移动目录到目标位置
- `remove()`: 删除目录及其所有内容

### 基础操作

#### `OPFS` 抽象类

所有文件和目录对象都继承自这个基类：

- `create()`: 创建文件系统对象
- `exists()`: 检查对象是否存在
- `remove()`: 删除对象
- `copyTo(dest)`: 复制到目标位置
- `moveTo(dest)`: 移动到目标位置

## 快速开始

```typescript
import { file, dir, write } from "opfs.js";

// 创建并写入文件
await write("/path/to/file.txt", "Hello, World!");

// 读取文件内容
const myFile = file("/path/to/file.txt");
const content = await myFile.text();
console.log(content); // "Hello, World!"

// 创建目录
const myDir = dir("/path/to/directory");
await myDir.create();

// 列出目录内容
const children = await myDir.children();
for (const child of children) {
  console.log(`${child.kind}: ${child.name}`);
}
```

## 示例

### 文件操作

```typescript
import { file, write } from "opfs.js";

// 写入数据到文件
await write("/data/config.json", JSON.stringify({ theme: "dark" }));

// 读取并解析 JSON
const configFile = file("/data/config.json");
const config = JSON.parse(await configFile.text());

// 流式读取大文件
const largeFile = file("/data/large-file.bin");
const stream = await largeFile.stream();
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 处理数据块
  console.log("读取数据块:", value.byteLength, "字节");
}
```

### 目录操作

```typescript
import { dir } from "opfs.js";

// 创建目录结构
const projectDir = dir("/projects/my-app");
await projectDir.create();

const srcDir = dir("/projects/my-app/src");
await srcDir.create();

// 列出目录内容
const children = await projectDir.children();
for (const child of children) {
  if (child.kind === "file") {
    console.log(`文件: ${child.name}`);
  } else {
    console.log(`目录: ${child.name}`);
  }
}

// 复制整个目录
await projectDir.copyTo("/backup/my-app-backup");
```

### 高级用法

```typescript
import { file, dir } from "opfs.js";

// 使用自定义选项的文件
const dataFile = file("/data/important.txt");
await dataFile.open({ mode: "readwrite" });

// 在指定位置写入
await dataFile.write("新内容", { at: 0 });

// 读取指定数量
const buffer = await dataFile.read(1024, { at: 0 });

// 截断文件
await dataFile.truncate(512);

// 确保数据写入磁盘
await dataFile.flush();
await dataFile.close();
```

## 浏览器支持

此库需要支持以下功能的浏览器：

- Origin Private File System (OPFS)
- Web Workers
- ReadableStream

## 浏览器支持

- Chrome 121+（完整支持 createSyncAccessHandle 及其 mode 选项）
- Edge 121+（完整支持 createSyncAccessHandle 及其 mode 选项）
- Firefox 111+（支持 createSyncAccessHandle，但暂不支持 mode 参数）
- Safari 15.2+（支持 createSyncAccessHandle，但暂不支持 mode 参数）

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 构建库
pnpm run build

# 运行代码检查
pnpm run lint
```

## 许可证

MIT 许可证 - 详见 [LICENSE](https://github.com/atox996/opfs/blob/main/LICENSE) 文件。

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 更新日志

版本历史请查看 [CHANGELOG.md](https://github.com/atox996/opfs/blob/main/CHANGELOG.md)。
