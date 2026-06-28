# 公网部署说明

这个项目已经可以部署成公网网站。部署时不要把 API Key 写进代码，只在云平台的环境变量里填写。

## 推荐第一版部署方式

优先建议使用香港、新加坡或日本节点的云服务：

- 不需要中国大陆网站备案即可先对外访问。
- 台湾和中国大陆用户访问速度通常都可以接受。
- 后续要接微信/支付宝支付、用户登录、图片存储时，也方便继续扩展。

如果服务器放在中国大陆，并绑定正式域名，一般需要先完成 ICP 备案。

## 必填环境变量

```env
ARK_API_KEY=你的火山方舟 API Key
ARK_IMAGE_MODEL=doubao-seedream-5-0-260128
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AIGC51_TOKEN=你的51AIGC或APIZ接口Token
APIZ_API_BASE=https://api.apiz.ai
PORT=8790
```

## 部署后检查

部署完成后访问：

```text
https://你的域名/api/health
```

看到类似下面内容，说明已经是真实 API 模式：

```json
{
  "hasApiKey": true,
  "dryRun": false,
  "model": "doubao-seedream-5-0-260128"
}
```

## 域名绑定流程

1. 在云平台创建网站服务。
2. 填入上面的环境变量。
3. 启动命令使用 `npm start`。
4. 在云平台添加你的域名。
5. 去域名服务商那里添加 DNS 记录。
6. 等待 HTTPS 证书自动签发。
7. 打开域名测试上传图片和生成图片。

## 第一版上线提醒

当前版本适合内部测试或小范围试用。正式商业版还需要继续加入：

- 用户登录
- 图片存储
- 任务队列
- 积分/套餐
- 微信/支付宝支付
- 防刷和调用限额
- 后台订单与用户管理
