---
name: knowledge-graph
description: 智能图谱：对一篇文章用 graph__* 工具构建、查看与修改知识图谱（实体/关系 JSON）。
---

# 智能图谱（DSH）

在 profile 本地文稿库中：粘贴或更新正文 → `graph__build_from_article` 或面板「AI 构建图谱」→ 校对 nodes/edges → `graph__save_article_graph`（带 graph_rev）。

## 工具前缀

`graph__*`（不是管理端 Java 的 `kg_*`）。

## 流程

1. `graph__create_article` / `graph__get_article`
2. 更新正文后 `graph__build_from_article`（异步）；`graph__get_workshop_state` / 面板看进度
3. `graph__search_nodes` 查子图
4. 改图：`graph__save_article_graph`（先读 graph_rev）或通过面板保存

## 图格式

`{ "nodes": [{ "id", "name", "type", "description" }], "edges": [{ "source", "target", "type", "label" }] }`