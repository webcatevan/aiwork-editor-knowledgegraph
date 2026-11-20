# AIWork 智能图谱

DeepSeek Harness 插件（可安装包 `@aiwork/dsh-knowledge-graph`）。把一篇文章交给当前默认模型，建成知识图谱，在画布上拖动节点、查看关系，并改节点名称或 JSON。

支持网站：<https://www.futureeditor.com>

> 仓库根目录不是插件包。它是 private 工作区，没有 `dsh.bundle`。安装路径必须指到 `packages/bundle`。

## 安装

克隆后直接安装（仓库已带 `packages/bundle/dist`）：

```bash
dsh plugin install link:/绝对路径/aiwork-editor-knowledgegraph/packages/bundle --profile <name>
```

改过源码后，在 `packages/bundle` 执行 `node build.mjs`，再重启 profile。构建使用设置里已经选中的模型；没选模型时，构建会提示先去设置里选择。

## 使用

1. 侧栏 **智能图谱** → 新建或打开文稿，编辑正文并保存。
2. **AI 构建图谱**。结果会写入本机书库，不需要再点保存。
3. 画布上拖动节点只改变画面位置。点节点可看相连节点和关系名称。
4. 改节点名称或 JSON 后，**保存图谱** 才会亮起，把修改写回书库。没有修改时按钮显示「图谱已保存」。

数据目录：`<profile>/kg-workshop/library.sqlite`。

本包 `private`，用上面的 link 安装。不发布到公共 npm。
