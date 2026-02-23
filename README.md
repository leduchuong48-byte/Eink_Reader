# Eink Reader

[English](README_en.md)

Eink Reader 是一个以 **WebUI 阅读体验** 为核心的局域网电子书阅读器，面向 E-ink 设备和低干扰阅读场景，支持书架管理、TXT/EPUB 阅读、阅读进度持久化与主题/排版控制。

## 为什么有用（痛点）

本地电子书管理常见问题：

- 文件分散在 NAS 或目录中，找书与定位章节效率低
- 手机/平板阅读器在 E-ink 设备上交互不友好
- 阅读进度与排版偏好难以跨会话持续

Eink Reader 把“发现书籍-打开阅读-保存进度-继续阅读”做成一个持续可用的 Web 流程，减少手工切换和重复配置。

## 项目做什么（功能概览）

- 书架浏览：目录懒加载、分页、关键字搜索
- 阅读支持：TXT 分块读取与 EPUB 渲染
- 阅读状态：TXT 偏移量 / EPUB CFI 进度持久化
- 阅读体验：多主题切换、排版设置、触摸/键盘/点击翻页
- 文件治理：支持在书架/阅读页删除 `.txt` 与 `.epub`

## WebUI 特色（代码可验证）

基于 `app/main.py` 与 `static/*`：

- 页面路由：`/`（书架页）、`/read?file=...`（阅读页）
- 文件 API：`GET /api/files`、`GET /api/search`
- 内容 API：`GET /api/content/{filepath}`（TXT 分块 + EPUB 文件流）
- 管理 API：`DELETE /api/files/{filepath}`

阅读页提供：

- 目录（TOC）展开与跳转
- 字号、行距、边距、对齐设置
- 主题轮换（E-ink / OLED Night / OLED Smooth / Paper Day）
- 清除阅读缓存与返回书架操作

## 如何快速开始（Getting Started）

### 环境要求

- Docker / Docker Compose（推荐）
- 或 Python 3.12+

### Docker 运行

1. 在项目目录创建书籍目录：`books/`，放入 `.txt` 与 `.epub` 文件。
2. 启动服务：

```bash
docker compose up -d --build
```

3. 打开：`http://<你的主机IP>:2004/`

### 本地运行

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
STORAGE_PATH=/你的书籍目录 uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

打开：`http://127.0.0.1:8000/`

### 运行测试

```bash
pytest -q
```

## 配置说明

- `STORAGE_PATH`：电子书根目录，默认 `/storage`
- `docker-compose.yml` 默认挂载：`./books:/storage`

## 在哪里获得帮助

- Issue：`https://github.com/leduchuong48-byte/Eink_Reader/issues`
- 建议附带：复现步骤、截图、日志片段、运行环境

## 维护者与贡献者

- Maintainer: `@leduchuong48-byte`

## 许可证

当前仓库未包含 `LICENSE` 文件。如需开源分发，建议补充许可证。

## 免责声明

使用本项目即表示你已阅读并同意 [免责声明](DISCLAIMER.md)。
