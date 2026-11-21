# PocketPet

[English](README.md) | 简体中文

把折叠手机变成桌面时钟 + 实时 AI coding agent 宠物。Mac bridge 收集 Qoder、Claude Code、Codex CLI、OpenCode、Pi 等 agent 的活动，通过 WiFi 推送到手机网页；无需安装 app、无需账号、无需云。

## 要求

- macOS，Node.js >= 20.6
- 手机与 Mac 在同一 WiFi（不同网络可用 USB `adb reverse`）

## 快速开始

```bash
npm install
npm run build
npm link
pocketpet up
```

`pocketpet up` 会创建 `~/.pocketpet`、询问是否安装 Claude Code hooks、询问是否开机启动 bridge，然后打印大 QR 并打开 Mac 上的 `/setup` 配对页。

**手机端**（零设置）：

1. 连接与 Mac 相同的 WiFi。
2. 用**手机相机**扫描 Mac 屏幕上的 QR。
3. 选择「添加到主屏幕」，充电时保持打开。

同一个 QR 可以重复使用，每部手机各扫一次；更改 `~/.pocketpet/config.json` 里的 token 后，所有手机都需要重新配对。不要分享配对后只剩 `/` 的地址（它没有 token），也不要在手机上打开 `/setup`（仅限 Mac）。

## 语言

应用界面支持 **English / 繁體中文 / 简体中文**：

- 手机端：齿轮抽屉中的语言选择，选择会保存在该手机。
- 配对页：URL 加 `?lang=en`、`?lang=zh-Hant`、`?lang=zh-Hans`。

## 宠物

支持 Petdex 宠物包：`~/.pocketpet/pets`、`~/.codex/pets`、`~/.petdex/pets`（同名 slug 以先扫描到的为准）。手机抽屉可搜索 Petdex 画廊并即时切换。

## USB fallback（不同网络）

macOS Monterey 之后已移除 Bluetooth PAN。不同网络时，用 USB 连接手机并在 Mac 运行：

```bash
adb reverse tcp:7788 tcp:7788
```

然后在手机打开 `http://127.0.0.1:7788/?token=...`（token 在 `pocketpet up` 输出或 `/setup` 页）。`127.0.0.1` 是安全上下文，Wake Lock 可保持启用。

## 安全

Bridge 只接受 loopback 的 agent 事件；手机 API 需要每安装一次生成的 token；`/setup` 仅限 Mac 并带 Host allowlist。没有遥测、没有云、事件不含代码/prompt/输出。详见 [SECURITY.md](SECURITY.md)。

## 许可与致谢

MIT。宠物格式与画廊来自 [Petdex](https://petdex.dev)（MIT）；宠物图像版权属于各提交者，本项目不分发宠物图。架构参考 [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk)（AGPL，仅参考，未复制代码）。各 agent 名称/商标属于其所有者，本项目与其无隶属关系。
