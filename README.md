# Taiwan Shopee AI Studio

一个面向台湾虾皮商品主图和详情页的 AI 生图网页。

## 本地运行

```bash
ARK_API_KEY=你的火山方舟API_KEY npm start
```

打开：

```text
http://127.0.0.1:8790
```

## GitHub 自动部署

推荐第一版使用“GitHub + Render/Railway 自动部署”：

1. 新建 GitHub 仓库。
2. 把本项目上传到仓库。
3. 在部署平台选择“从 GitHub 导入项目”。
4. 设置环境变量：

```env
ARK_API_KEY=你的火山方舟 API Key
ARK_IMAGE_MODEL=doubao-seedream-5-0-260128
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

5. 启动命令使用：

```bash
npm start
```

6. 部署完成后访问：

```text
https://你的域名/api/health
```

如果返回 `hasApiKey: true` 和 `dryRun: false`，说明真实生图接口已经生效。

## 注意

不要把 `.env` 或 API Key 上传到 GitHub。

