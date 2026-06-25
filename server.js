const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8790);
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const DRY_RUN = process.env.ARK_DRY_RUN === "1" || !ARK_API_KEY;
const root = __dirname;
const allowedModels = {
  "doubao-seedream-5-0-260128": "Doubao Seedream 5.0",
  "doubao-seedream-4-5-251128": "Doubao Seedream 4.5",
  "doubao-seedream-4-0-250828": "Doubao Seedream 4.0",
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const mainTitles = ["爆款主视觉", "场景使用图", "痛点解决图", "卖点标签图", "材质细节图", "升级对比图", "安心出货图"];
const detailTitles = ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"];

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 35 * 1024 * 1024) {
        reject(new Error("请求体过大，请减少上传图片数量或压缩图片。"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function selectedOutputs(settings) {
  const items = [];
  if (settings.includeMain) items.push(...mainTitles.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 })));
  if (settings.includeDetail) items.push(...detailTitles.map((title, index) => ({ type: "详情页", kind: "detail", title, index: index + 1 })));
  return items.length ? items : mainTitles.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 }));
}

function promptFor(item, settings) {
  const name = settings.productName || "根据图片自动识别商品名称";
  const benefit = settings.coreBenefit || "根据图片自动提炼核心卖点";
  const extra = settings.extraInfo || "未提供额外信息，请根据图片谨慎判断，不要编造规格。";
  const constraints = settings.constraints || "不要添加未提供的品牌、认证、尺寸、材质或夸张功效。";
  const role = item.kind === "main" ? "台湾虾皮商品主图" : "台湾虾皮商品详情页";
  const style = settings.stylePreset === "clean" ? "干净白底、橙色点缀、移动端可读" : settings.stylePreset === "dark" ? "黑橙科技质感、强对比、适合车用品" : "橙色爆款电商风、粗体繁体中文、白描边、圆角信息块";

  return [
    `你是专业台湾虾皮电商设计师。请基于用户上传的产品图，直接生成一张 1:1 ${role}。`,
    `图片编号：${item.type} ${String(item.index).padStart(2, "0")}，主题：${item.title}。`,
    `商品名称：${name}。核心卖点：${benefit}。`,
    `可选补充信息：${extra}。`,
    `用户约束：${constraints}。`,
    `整体风格：${style}。`,
    "必须保留产品真实外观、颜色、材质纹理、结构比例、可见 Logo/标签和口袋/扣具/边线等关键细节。",
    "画面文字使用台湾繁体中文，不要使用简体字。文案短、粗、大，适合手机端浏览。",
    "不要凭空增加配件、功能、认证、承重、防水等级、品牌或规格。",
  ].join("\n");
}

function modelFromSettings(settings) {
  return allowedModels[settings.model] ? settings.model : ARK_MODEL;
}

async function callArkImage(prompt, images, model) {
  const body = {
    model,
    prompt,
    size: "1920x1920",
    response_format: "b64_json",
    n: 1,
    image: images.map((img) => img.dataUrl),
  };

  const response = await fetch(`${ARK_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `Ark API 请求失败：${response.status}`);
  const first = data.data?.[0] || {};
  if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first.url) return first.url;
  throw new Error("Ark API 未返回图片 URL 或 base64。");
}

function mockResult(item, images) {
  return { ...item, url: images[item.index % images.length]?.dataUrl || images[0]?.dataUrl || "", mock: true };
}

async function handleGenerate(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    const settings = body.settings || {};
    const model = modelFromSettings(settings);
    if (!images.length) return sendJson(res, 400, { error: "请至少上传 1 张产品图。" });

    let items = selectedOutputs(settings);
    const limit = Number(settings.limit || 0);
    if (Number.isFinite(limit) && limit > 0) items = items.slice(0, limit);
    if (DRY_RUN) return sendJson(res, 200, { mode: "mock", model: ARK_MODEL, results: items.map((item) => mockResult(item, images)) });

    const results = [];
    for (const item of items) {
      try {
        const prompt = promptFor(item, settings);
        const url = await callArkImage(prompt, images, model);
        results.push({ ...item, url, prompt });
      } catch (error) {
        results.push({ ...item, error: error.message });
      }
    }
    sendJson(res, 200, { mode: "real", model, results });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  const rawPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(root, rawPath === "/" ? "index.html" : rawPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") return sendJson(res, 200, { hasApiKey: Boolean(ARK_API_KEY), dryRun: DRY_RUN, model: ARK_MODEL, models: allowedModels });
  if (req.url === "/api/generate" && req.method === "POST") return handleGenerate(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Shopee AI Studio running at http://127.0.0.1:${PORT}`);
  console.log(`Ark mode: ${DRY_RUN ? "mock (set ARK_API_KEY to enable real calls)" : "real"} | model: ${ARK_MODEL}`);
});
