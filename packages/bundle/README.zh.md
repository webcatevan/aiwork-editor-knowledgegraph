# @aiwork/dsh-knowledge-graph（智能图谱）

DSH 组合包：用设置里选中的默认模型，把一篇文章建成知识图谱，再在画布上查看和修改。

| 部分 | 产物 | 说明 |
|------|------|------|
| Host | `dist/index.js` | SQLite 文稿库 + `graph__*` 工具 + `/api/kg/*` |
| Client | `dist/client.js` | 侧栏「**智能图谱**」面板 |
| Skill | `skill/SKILL.md` | Agent 使用说明 |

支持网站：<https://www.futureeditor.com>

## 安装

装**这个包**（`packages/bundle`），不是仓库根目录。根目录是 private 工作区，没有 `dsh.bundle`。

```bash
dsh plugin install link:/绝对路径/aiwork-editor-knowledgegraph/packages/bundle --profile <name>
```

仓库已包含 `dist/`。改过源码后在本目录执行 `node build.mjs`，再重启 profile。

## 使用

1. 侧栏 **智能图谱** → 文稿库 → 新建 / 打开
2. 编辑 **正文** → 保存正文
3. **AI 构建图谱**。结果直接写入书库
4. 画布可拖动节点；点节点查看相连节点和关系名称
5. 改节点名称或 JSON 后点 **保存图谱**。没有修改时按钮是「图谱已保存」

拖动节点不写入图谱数据。

数据目录：`<profile>/kg-workshop/library.sqlite`

本包 `private`，用上面的 link 安装。不发布到公共 npm。

## 开发

```bash
cd packages/bundle
node build.mjs
npm test   # Node ≥22.5；host.smoke 需旁路 deepseek-harness 已构建 dsh-tools
```
