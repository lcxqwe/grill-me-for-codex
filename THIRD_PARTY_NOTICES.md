# Third-party dependencies

This repository refers to packages through npm dependency declarations; their source directories are not committed.

| Package | License | Source |
| --- | --- | --- |
| `@modelcontextprotocol/ext-apps` | MIT | https://github.com/modelcontextprotocol/ext-apps |
| `@modelcontextprotocol/server` | Apache-2.0 | https://github.com/modelcontextprotocol/typescript-sdk |
| `@modelcontextprotocol/client` | Apache-2.0 | https://github.com/modelcontextprotocol/typescript-sdk |
| `@modelcontextprotocol/core` | Apache-2.0 | https://github.com/modelcontextprotocol/typescript-sdk |
| `zod` | MIT | https://github.com/colinhacks/zod |
| `esbuild` | MIT | https://github.com/evanw/esbuild |

The lockfile records exact package versions. `npm run build` collects the installed packages' license/notice files into `dist/THIRD_PARTY_LICENSES.txt`. Preserve that file when distributing the generated server or UI bundle. A dependency license does not license this project's original code.
