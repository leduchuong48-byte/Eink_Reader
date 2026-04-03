# WebDAV 虚拟挂载设计文档

**日期：** 2026-04-01  
**目标：** 将 WebDAV 书籍来源从"本地镜像同步"架构重构为"纯虚拟挂载"架构，实现多设备配置共享。

---

## 背景

原有架构要求每个设备配置独立的"本地目录"，导致 WebDAV 源配置无法跨设备共享。重构为纯虚拟挂载后，WebDAV 源只需配置远端信息，书籍实时从 WebDAV 服务器读取，不在本地存储。

---

## 架构

### 路径约定

WebDAV 文件使用 `webdav://<source_id>/<remote_relative_path>` 作为路径标识：

- `webdav://abc123` — WebDAV 源根目录（虚拟文件夹）
- `webdav://abc123/subdir/book.epub` — WebDAV 文件

本地文件路径保持不变（相对于 STORAGE_PATH 的 posix 路径）。

### 数据流

```
浏览书架根目录
  GET /api/files
  → 本地目录内容 + 每个启用的 WebDAV 源作为虚拟文件夹

展开 WebDAV 虚拟文件夹
  GET /api/files?path=webdav://source_id/subdir
  → 实时 WebDAV ls → 返回目录内容（含 webdav:// 路径）

阅读 WebDAV 文件
  /read?file=webdav://source_id/book.epub
  GET /api/content/webdav://source_id/book.epub
  → 实时 WebDAV 下载 → 流式返回文件内容

删除 WebDAV 文件
  DELETE /api/files/webdav://source_id/book.epub
  → 删除远端文件（前端先弹确认对话框）
```

---

## 后端改动

### 删除

- `local_path` 字段（配置模型）
- `webdav_sync_state.json` 状态文件
- `_sync_webdav_source`、`_collect_remote_tree`、`_download_remote_file`、`_prune_local_bound_directory`
- `_find_bound_source_for_relative_path`、`_bound_remote_path`、`_prune_sync_state_for_source`
- `_ensure_unique_local_path`、`_safe_relative_directory`
- `POST /api/webdav/sources/{id}/sync`、`POST /api/webdav/sync-all`

### 新增 / 改造

**`GET /api/files?path=<path>`**
- `path` 为空或本地路径：原有逻辑不变
- `path` 以 `webdav://` 开头：解析 source_id 和远端子路径，实时 WebDAV ls 返回内容
- 根目录（`path` 为空）时，将所有启用的 WebDAV 源追加为虚拟 directory 节点

**`GET /api/content/{filepath:path}`**
- `filepath` 以 `webdav://` 开头：解析并实时下载远端文件内容返回
- epub 直接流式返回；txt 按现有 offset/limit 逻辑处理（需全量下载后切片）

**`DELETE /api/files/{filepath:path}`**
- `filepath` 以 `webdav://` 开头：调用 WebDAV remove 删除远端文件

**WebDAV 源配置字段简化：**
```json
{
  "id": "hex",
  "name": "string",
  "base_url": "string",
  "username": "string",
  "password": "string",
  "remote_path": "string",
  "enabled": true
}
```

---

## 前端改动

### 设置面板
- 去掉"本地目录"输入框
- 去掉"同步"和"全部同步"按钮
- 去掉同步状态反馈区域

### 书架树
- WebDAV 虚拟文件夹用 ☁️ 图标（本地文件夹用 📂）
- 展开 WebDAV 文件夹时请求 `webdav://` 路径
- WebDAV 文件用 ☁️ 图标（本地文件用 📄）

### 删除确认
- 路径含 `webdav://` 时，确认提示："确认从 WebDAV 服务器删除文件：xxx？"
