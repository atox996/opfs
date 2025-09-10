# opfs.js

For Chinese documentation, see [README.zh.md](https://github.com/atox996/opfs/blob/main/README.zh.md).

A modern TypeScript library for working with the Origin Private File System (OPFS) in web browsers. Provides a clean, promise-based API for file and directory operations.

## Features

- 🚀 **Modern API**: Clean, promise-based interface
- 📁 **File Operations**: Create, read, write, delete files
- 📂 **Directory Operations**: Create, list, copy, move directories
- 🔄 **Stream Support**: Built-in support for ReadableStream
- 🛡️ **Type Safe**: Full TypeScript support with comprehensive type definitions
- ⚡ **Performance**: Uses Web Workers for non-blocking file operations
- 🌐 **Browser Native**: Built on top of the OPFS API

## Installation

```bash
npm install opfs.js
# or
pnpm add opfs.js
# or
yarn add opfs.js
```

## API Documentation

For detailed API documentation, please refer to [https://atox996.github.io/opfs/](https://atox996.github.io/opfs/).

### Core Functions

#### `file(path: string): OPFile`

Creates a file object for the specified path.

#### `dir(path: string): OPDir`

Creates a directory object for the specified path.

#### `write(target: string | OPFile, data: string | BufferSource | ReadableStream | OPFile, overwrite?: boolean): Promise<void>`

Convenience function to write data to a file.

### File Operations

#### `OPFile` Class

- `create()`: Create the file
- `exists()`: Check if file exists
- `open(options?)`: Open file for synchronous access
- `read(size, options?)`: Read data from file
- `write(data, options?)`: Write data to file
- `truncate(newSize)`: Truncate file to specified size
- `flush()`: Flush file buffer to disk
- `getSize()`: Get file size in bytes
- `close()`: Close file handle
- `text()`: Read entire file as text
- `arrayBuffer()`: Read entire file as ArrayBuffer
- `stream()`: Get file as ReadableStream
- `getFile()`: Get native File object
- `copyTo(dest)`: Copy file to destination
- `moveTo(dest)`: Move file to destination
- `remove()`: Delete file

### Directory Operations

#### `OPDir` Class

- `create()`: Create the directory
- `exists()`: Check if directory exists
- `children()`: Get all children (files and subdirectories)
- `copyTo(dest)`: Copy directory to destination
- `moveTo(dest)`: Move directory to destination
- `remove()`: Delete directory and all contents

### Base Operations

#### `OPFS` Abstract Class

All file and directory objects inherit from this base class:

- `create()`: Create the file system object
- `exists()`: Check if object exists
- `remove()`: Delete the object
- `copyTo(dest)`: Copy to destination
- `moveTo(dest)`: Move to destination

## Quick Start

```typescript
import { file, dir, write } from "opfs.js";

// Create and write to a file
await write("/path/to/file.txt", "Hello, World!");

// Read file content
const myFile = file("/path/to/file.txt");
const content = await myFile.text();
console.log(content); // "Hello, World!"

// Create a directory
const myDir = dir("/path/to/directory");
await myDir.create();

// List directory contents
const children = await myDir.children();
for (const child of children) {
  console.log(`${child.kind}: ${child.name}`);
}
```

## Examples

### File Operations

```typescript
import { file, write } from "opfs.js";

// Write data to file
await write("/data/config.json", JSON.stringify({ theme: "dark" }));

// Read and parse JSON
const configFile = file("/data/config.json");
const config = JSON.parse(await configFile.text());

// Stream large file
const largeFile = file("/data/large-file.bin");
const stream = await largeFile.stream();
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Process chunk
  console.log("Read chunk:", value.byteLength, "bytes");
}
```

### Directory Operations

```typescript
import { dir } from "opfs.js";

// Create directory structure
const projectDir = dir("/projects/my-app");
await projectDir.create();

const srcDir = dir("/projects/my-app/src");
await srcDir.create();

// List directory contents
const children = await projectDir.children();
for (const child of children) {
  if (child.kind === "file") {
    console.log(`File: ${child.name}`);
  } else {
    console.log(`Directory: ${child.name}`);
  }
}

// Copy entire directory
await projectDir.copyTo("/backup/my-app-backup");
```

### Advanced Usage

```typescript
import { file, dir } from "opfs.js";

// File with custom options
const dataFile = file("/data/important.txt");
await dataFile.open({ mode: "readwrite" });

// Write at specific position
await dataFile.write("New content", { at: 0 });

// Read specific amount
const buffer = await dataFile.read(1024, { at: 0 });

// Truncate file
await dataFile.truncate(512);

// Ensure data is written to disk
await dataFile.flush();
await dataFile.close();
```

## Browser Support

This library requires browsers that support:

- Origin Private File System (OPFS)
- Web Workers
- ReadableStream

## Browser Support

- Chrome 121+ (createSyncAccessHandle with full mode option support)
- Edge 121+ (createSyncAccessHandle with full mode option support)
- Firefox 111+ (createSyncAccessHandle supported, but mode parameter not yet available)
- Safari 15.2+ (createSyncAccessHandle supported, but mode parameter not yet available)

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build the library
pnpm run build

# Run linting
pnpm run lint
```

## License

MIT License - see [LICENSE](https://github.com/atox996/opfs/blob/main/LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Changelog

See [CHANGELOG.md](https://github.com/atox996/opfs/blob/main/CHANGELOG.md) for version history.
