# 配置与环境变量

用户偏好保存在应用设置仓储中；插件配置应使用插件自己的设置/API，不要把旧键名当成新功能契约。桌面数据目录可通过 `HYPERSHELL_DATA_DIR` 指向隔离目录。

## 运行时变量

| 变量 | 用途 |
| --- | --- |
| `HYPERSHELL_DATA_DIR` | 将应用数据定向到指定目录；适用于隔离开发和 Electron E2E。目录应由测试/开发者专用，不要指向真实用户数据。 |
| `SSHTERM_RENDERER_URL` | 指定开发 renderer 地址；启动代码会校验 URL，不应在生产环境指向任意站点。 |
| `SSHTERM_ENABLE_LOCAL_FS` / `HYPERSHELL_ENABLE_LOCAL_FS` | 启用或禁用本地文件 API。 |
| `SSHTERM_ENABLE_SSH_KEY_DISCOVERY` / `HYPERSHELL_ENABLE_SSH_KEY_DISCOVERY` | 控制 SSH 私钥发现能力。 |
| `SSHTERM_FS_ALLOW_SYSTEM_ROOTS` / `HYPERSHELL_FS_ALLOW_SYSTEM_ROOTS` | 控制本地文件 API 是否可浏览系统根目录。 |
| `SSHTERM_FS_ALLOWED_ROOTS` / `HYPERSHELL_FS_ALLOWED_ROOTS` | 限制本地文件访问的允许根目录；格式以 `fsIpc.ts` 的解析实现为准。 |
| `SSH_AUTH_SOCK` | Unix 环境 SSH agent socket 的常用环境约定；具体支持点以连接实现为准。 |
| `CI` | CI 工具链环境标志，可影响 Playwright 重试和服务器复用。 |

布尔值默认值和主/别名优先顺序以 `apps/desktop/src/main/platform/ipc/fsIpc.ts` 当前 `envEnabled` / `readEnv` 实现为准，不从旧表格推断。主机认证解析优先级以 `apps/desktop/src/main/platform/security/credentialResolver.ts` 为准。

## 测试与打包变量

| 变量 | 用途 |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | UI Browser E2E 的基础 URL。 |
| `PLAYWRIGHT_START_SERVER` | 控制 Playwright 是否启动 UI 开发服务器。 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | 指定可选 Chromium 可执行文件路径。 |
| `CSC_LINK`、`CSC_KEY_PASSWORD` | Windows 桌面包代码签名证书来源和口令。仅在受控发布环境配置，不写入仓库或日志。 |

## 验证与事实来源

配置可能由 Electron 主进程、Vite、Playwright 或发布脚本各自解析。改动时用 `rg` 检查变量的读取点和测试，不要仅根据变量名假设其作用范围。可用 [开发环境与启动](./getting-started) 和[构建、测试与打包](./build-test) 查看操作流程。
