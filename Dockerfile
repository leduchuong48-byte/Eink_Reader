FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static

# 本地引用 epub.js（运行时由 /static/js/epub.min.js 提供）
RUN curl -L https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js -o /app/static/js/jszip.min.js \
    && curl -L https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js -o /app/static/js/epub.min.js

# 本地引用 PDF.js（运行时由 /static/js/pdf.min.js 提供）
RUN curl -L https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js -o /app/static/js/pdf.min.js \
    && curl -L https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js -o /app/static/js/pdf.worker.min.js

# 提供 PDF.js CMap 资源，减少字体映射告警并提升兼容性
RUN curl -L https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-3.11.174.tgz -o /tmp/pdfjs-dist.tgz \
    && mkdir -p /app/static/pdfjs \
    && mkdir -p /tmp/pdfjs_extract \
    && tar -xzf /tmp/pdfjs-dist.tgz -C /tmp/pdfjs_extract \
    && cp -r /tmp/pdfjs_extract/package/cmaps /app/static/pdfjs/cmaps \
    && cp -r /tmp/pdfjs_extract/package/standard_fonts /app/static/pdfjs/standard_fonts

RUN rm -rf /tmp/pdfjs-dist.tgz /tmp/pdfjs_extract

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
