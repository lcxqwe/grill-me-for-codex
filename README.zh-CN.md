# grill-me-for-codex

在 Codex 中用问卷梳理项目计划。支持单选、多选、图片选项、评分、排序和文字回答。

## 安装

需要 Node.js 20+、npm 和 Python 3.11+。

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run build
python scripts/install.py
```

安装脚本优先使用 `CODEX_HOME`，否则使用当前用户的 `.codex` 目录。安装后会添加 `grill-me-for-codex` 技能和名为 `grill_ui` 的 MCP 服务。如果同名服务已被其他工具占用，脚本会停止安装。

想先查看安装计划，可以运行 `python scripts/install.py --dry-run`。用 `--codex-home` 指定其他安装位置。

安装或更新后，重新连接 MCP 服务，再次调用技能。

## 使用

```text
$grill-me-for-codex 帮我检查这个项目计划，每次问一道题。
```

在卡片中选择或填写答案，按需添加补充说明，然后点击“提交答案”。也可以暂时跳过。推荐选项不会替你选中。

运行 `npm run preview`，打开终端显示的地址，可以单独试用问卷控件。

## 继续之前的问卷

回到原聊天，发送“继续”。题目和已提交答案在本地保留 30 天；关闭卡片前尚未提交的填写，需要重新输入。

如果提交后答案已保存，但聊天没有继续，重新连接服务并再次调用技能。对话内卡片和等待期间提交的支持取决于 Codex 客户端；自定义卡片不可用时，技能会使用原生提问工具。

聊天历史或保存记录已删除、记录已过期时，需要重新提问。

## 隐私

题目、图片和已提交答案以明文保存在安装目录的 `state/` 文件夹中。不要用问卷填写密码或密钥，也不要把这个文件夹上传到仓库。

## 开发检查

```sh
npm test
python scripts/check_privacy.py
```

第三方依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目原创代码暂未选定许可证。
