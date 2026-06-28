const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8790);
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const APIZ_API_BASE = process.env.APIZ_API_BASE || "https://api.apiz.ai";
const AIGC51_TOKEN = process.env.AIGC51_TOKEN || "";
const DRY_RUN = process.env.ARK_DRY_RUN === "1" || !ARK_API_KEY;
const root = __dirname;
const uploadStore = new Map();
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

const mainBlueprints = [
  {
    title: "爆款首圖",
    purpose: "列表第一眼搶點擊，讓買家在 1 秒內理解商品是什麼、適合誰、解決什麼需求。",
    copy: "主標 4-8 字，優先使用產品名稱或核心用途；搭配 2-3 個短標籤，例如「收納有序」「隨手取用」「車內整潔」。",
    scene: "產品置中放大，乾淨高對比背景，保留足夠留白，右側或下方放大型賣點字。",
  },
  {
    title: "情境使用圖",
    purpose: "建立使用代入感，讓台灣買家知道商品放在哪裡、怎麼用、日常情境是否合適。",
    copy: "主標聚焦使用情境，例如「通勤好幫手」「露營也適用」「家庭出遊更方便」，副標只寫可見用途。",
    scene: "依產品品類自動生成合理生活或車內場景，商品必須是畫面主角，不要被人物或背景搶走焦點。",
  },
  {
    title: "痛點解決圖",
    purpose: "把購買理由講清楚，對比使用前後或展示痛點到解法的轉換，提高點擊後的理解效率。",
    copy: "主標用問題到解法格式，例如「告別雜亂」「拿取更順手」「空間不浪費」，避免誇大功效。",
    scene: "可使用左右對比、箭頭、紅叉綠勾或整理前後視覺，但不要捏造產品不具備的功能。",
  },
  {
    title: "賣點標籤圖",
    purpose: "集中呈現 3-4 個可視或可合理推論的核心賣點，幫助買家快速掃描。",
    copy: "使用短標籤，優先來自圖片可見結構、材質表現、收納格、扣具、開口、厚度、安裝方式等；未知規格不得編造。",
    scene: "產品大圖搭配圓角標籤、指示線、局部放大框，文字要大且少，適合手機端。",
  },
  {
    title: "質感細節圖",
    purpose: "提升信任感與價值感，展示材質、邊線、開口、扣具、紋理、容量感等細節。",
    copy: "主標聚焦品質感，例如「細節看得見」「質感升級」「耐看又實用」，只描述可見細節。",
    scene: "微距或局部特寫風格，保留完整產品識別，使用放大鏡、局部框或材質紋理背景。",
  },
];
const mainTitles = mainBlueprints.map((item) => item.title);
const detailTitles = ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"];

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function dataUrlToUpload(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) throw new Error("图片格式无效，请上传 PNG、JPG 或 WebP。");
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  return { mime, buffer: Buffer.from(match[2], "base64") };
}

function createPublicImageUrls(req, images) {
  return images.map((image) => {
    const upload = dataUrlToUpload(image.dataUrl);
    const id = crypto.randomUUID();
    uploadStore.set(id, { ...upload, createdAt: Date.now() });
    return `${publicBaseUrl(req)}/uploads/${id}`;
  });
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
  const goal = settings.goal === "click" ? "优先提升列表点击率，强化第一眼吸引力和核心卖点识别。" : settings.goal === "conversion" ? "优先提升详情页转化，强化可信说明、使用场景和购买理由。" : "兼顾点击率与转化率，画面清楚、卖点明确、信息不过载。";
  const mainBlueprint = item.kind === "main" ? mainBlueprints[item.index - 1] || mainBlueprints[0] : null;
  const mainStrategy = mainBlueprint
    ? [
        `本张主图销售定位：${mainBlueprint.purpose}`,
        `广告文案策略：${mainBlueprint.copy}`,
        `画面布局策略：${mainBlueprint.scene}`,
      ].join("\n")
    : "";

  return [
    `你是专业台湾虾皮电商设计师和商品广告策划。请基于用户上传的产品图，直接生成一张 1:1 ${role}。`,
    `图片编号：${item.type} ${String(item.index).padStart(2, "0")}，主题：${item.title}。`,
    "开始创作前，请先在内部完成商品理解：识别产品品类、可见结构、颜色材质、可能使用场景、目标受众、购买动机、可见卖点与不可确认信息；这些分析不要输出成大段文字，只用于画面和文案决策。",
    `商品名称：${name}。核心卖点：${benefit}。`,
    `可选补充信息：${extra}。`,
    `用户约束：${constraints}。`,
    `出图目标：${goal}`,
    mainStrategy,
    `整体风格：${style}。`,
    "必须保留产品真实外观、颜色、材质纹理、结构比例、可见 Logo/标签和口袋/扣具/边线等关键细节。",
    "画面文字使用台湾繁体中文，不要使用简体字。使用台湾电商常用词，例如：品質、規格、材質、收納、車用、居家、適用、便利、耐看、實用。",
    "广告文案必须短、粗、大，适合手机端浏览；主标题不超过 10 个中文字，卖点标签每个不超过 8 个中文字。",
    "不要凭空增加配件、功能、认证、承重、防水等级、品牌或规格。",
    "不要生成夸大承诺，例如第一名、最强、绝对安全、医疗功效、认证合格，除非用户明确提供证明。",
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
    watermark: false,
    add_watermark: false,
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

async function apizRequest(pathname, body) {
  if (!AIGC51_TOKEN) throw new Error("当前模型需要配置 AIGC51_TOKEN。");
  const response = await fetch(`${APIZ_API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AIGC51_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.message || `模型服务请求失败：${response.status}`);
  if (data.code && data.code !== 200) throw new Error(data.message || `模型服务请求失败：${data.code}`);
  return data;
}

function apizImageUrl(data) {
  const task = data?.data || data || {};
  const output = task.output || task.result || {};
  const images = output.images || task.images || [];
  const first = images[0];
  return typeof first === "string" ? first : first?.url;
}

async function waitForApizTask(taskId) {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const data = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
    const task = data?.data || data || {};
    if (task.status === "completed" || task.status === "succeeded" || task.status === "success") {
      const url = apizImageUrl(data);
      if (url) return url;
      throw new Error("任务已完成，但没有返回图片地址。");
    }
    if (task.status === "failed" || task.status === "error") {
      throw new Error(task.error || task.message || "图片生成失败。");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("图片生成超时，请稍后重试。");
}

async function callApizImage(prompt, imageUrls, provider) {
  const isGptImage2 = provider === "gpt-image-2";
  const model = isGptImage2 ? (imageUrls.length ? "openai/gpt-image-2/edit" : "openai/gpt-image-2") : "kapon/gemini-3-pro-image-preview";
  const params = isGptImage2
    ? {
        prompt,
        image_urls: imageUrls,
        image_size: "1:1",
        resolution: "1K",
        quality: "low",
        num_images: 1,
        output_format: "png",
        watermark: false,
        add_watermark: false,
      }
    : {
        prompt,
        image_urls: imageUrls,
        size: "1K",
        aspect_ratio: "1:1",
        watermark: false,
        add_watermark: false,
      };

  const created = await apizRequest("/api/v3/tasks/create", { model, params, channel: null });
  const taskId = created?.data?.task_id || created?.data?.id || created?.task_id || created?.id;
  if (!taskId) throw new Error("模型服务没有返回任务 ID。");
  return waitForApizTask(taskId);
}

async function callSelectedImageModel(prompt, images, model, provider, imageUrls) {
  if (provider === "gpt-image-2" || provider === "banana-pro") return callApizImage(prompt, imageUrls, provider);
  return callArkImage(prompt, images, model);
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
    const provider = ["gpt-image-2", "banana-pro"].includes(settings.modelProvider) ? settings.modelProvider : "ark";
    if (!images.length) return sendJson(res, 400, { error: "请至少上传 1 张产品图。" });

    let items = selectedOutputs(settings);
    const limit = Number(settings.limit || 0);
    if (Number.isFinite(limit) && limit > 0) items = items.slice(0, limit);
    if (DRY_RUN && provider === "ark") return sendJson(res, 200, { mode: "mock", model: ARK_MODEL, results: items.map((item) => mockResult(item, images)) });

    const results = [];
    const imageUrls = provider === "ark" ? [] : createPublicImageUrls(req, images);
    for (const item of items) {
      try {
        const prompt = promptFor(item, settings);
        const url = await callSelectedImageModel(prompt, images, model, provider, imageUrls);
        results.push({ ...item, url, prompt });
      } catch (error) {
        results.push({ ...item, error: error.message });
      }
    }
    sendJson(res, 200, { mode: "real", model, provider, results });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function serveUpload(req, res) {
  const id = decodeURIComponent(req.url.split("?")[0].replace("/uploads/", ""));
  const upload = uploadStore.get(id);
  if (!upload) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": upload.mime,
    "Cache-Control": "public, max-age=3600",
  });
  res.end(upload.buffer);
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
  if (req.url.startsWith("/uploads/")) return serveUpload(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Shopee AI Studio running at http://127.0.0.1:${PORT}`);
  console.log(`Ark mode: ${DRY_RUN ? "mock (set ARK_API_KEY to enable real calls)" : "real"} | model: ${ARK_MODEL}`);
});
