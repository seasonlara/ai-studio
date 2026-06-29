const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");

const PORT = Number(process.env.PORT || 8790);
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const APIZ_API_BASE = process.env.APIZ_API_BASE || "https://api.apiz.ai";
const AIGC51_TOKEN = process.env.AIGC51_TOKEN || "";
const DRY_RUN = process.env.ARK_DRY_RUN === "1" || !ARK_API_KEY;
const root = __dirname;
const uploadStore = new Map();
const jobs = new Map();
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
    title: "全方位主視覺",
    purpose: "列表第一眼搶點擊，讓買家立刻理解商品品類、核心用途與主要購買理由。",
    copy: "主標使用商品品類或核心用途，例如「兒童安全座椅」「車用收納盒」；搭配 2-3 個可見賣點短標籤，例如「穩固支撐」「加厚設計」「清潔便利」。只有商品明確是收納盒、收納袋、置物架時才可使用「收納」相關文案。",
    scene: "產品置中放大，暖橙奶油色高級棚拍背景，可加入一個局部放大圓框與箭頭；主標置頂，賣點標籤分布在四周，保留手機端可讀留白。",
  },
  {
    title: "防護支撐圖",
    purpose: "把產品能提供的支撐、固定、保護或穩定感視覺化，降低買家對使用安全與穩定性的疑慮。",
    copy: "使用 3 個短標籤描述可見或用戶提供的結構賣點，例如「背部支撐」「側邊包覆」「底部加穩」「可拆清洗」；避免寫絕對安全、碰撞保護、認證合格等未提供聲明。",
    scene: "產品以 3/4 角度展示，周圍加入柔和防護光弧、盾牌感圖形、指示線，標籤指向背部、側邊、底部或固定結構。",
  },
  {
    title: "折疊多角度圖",
    purpose: "展示正面、側面、收納或折疊狀態，讓買家快速理解產品形態與空間佔用。",
    copy: "使用視角標籤，例如「正面視圖」「側面視圖」「折疊收納」「輕巧好放」；若產品不可折疊，改為「正面視圖」「側面視圖」「背面視圖」。",
    scene: "使用三分割或透視舞台版面，同一商品出現 3 個角度，背景分區但色系統一，文字大黑字白描邊。",
  },
  {
    title: "升級比較圖",
    purpose: "用對比說服買家理解本商品相較一般款的差異，突出購買理由。",
    copy: "左右對比：左側「本商品」使用綠勾，右側「一般款」使用紅叉；只比較可見或用戶提供的內容，例如「多點固定」「舒適透氣」「加厚支撐」對比「固定不足」「支撐較少」「容易滑動」。不得寫多國認證、承重、材質規格，除非用戶提供。",
    scene: "左右雙欄對比卡片，左側暖色明亮，右側灰色弱化；商品大圖與一般替代品示意圖對照，底部放 3 行短文案。",
  },
  {
    title: "商品規格表",
    purpose: "用表格降低決策疑慮，整理買家最關心的商品資訊。",
    copy: "表格列出「商品名稱」「適用情境」「材質」「尺寸」「內容物」等欄位；沒有用戶提供的硬規格時，欄位值寫「以賣場資訊為準」或「請補充」，不要生成年齡、承重、尺寸、材質等假資料。",
    scene: "大標題「詳細商品規格表」，圓角表格居中，棕橙色表頭與黑色粗線，文字清楚大字，背景簡潔。",
  },
  {
    title: "細節特寫圖",
    purpose: "展示產品的真實細節，建立品質信任感。",
    copy: "選 3 個原圖可見細節做短標籤，例如「透氣網布」「精密車線」「調節織帶」「加厚邊線」「可愛圖案」。扣具類文案必須對應原圖同款扣具；若扣具形狀不清楚，改寫「調節織帶」或「細節特寫」。",
    scene: "三段式細節版面：左圖右字或交錯卡片，使用原產品局部微距特寫、圓角圖片框、粗體繁體中文，背景為高級暖橙漸層。局部圖不可替換成其他商品的扣具、織帶、面料或圖案。",
  },
  {
    title: "包裝內容圖",
    purpose: "讓買家知道收到什麼，降低下單前的不確定感。",
    copy: "標題「完整包裝內容」；列出「商品主體」「使用說明」「配件包」等，只有在圖片或補充資訊可確認時才寫具體件數，否則加小字「內容物依實際出貨為準」。",
    scene: "俯拍或斜俯拍平鋪，商品主體、折疊狀態、說明書與配件示意分區排列；每個物件下方有短標籤，整體乾淨可信。",
  },
  {
    title: "使用情境圖",
    purpose: "建立真實使用代入感，讓買家想像商品放在自己的生活或車內場景。",
    copy: "主標聚焦使用情境，例如「家庭出遊更安心」「通勤收納更順手」「車內空間更整齊」；副標如「安裝簡單」需以可見結構或用戶補充為準。",
    scene: "依產品品類生成合適實景：車用品放在車內，居家用品放在居家場景；可有人物互動，但商品必須是主角，人物自然不遮擋產品。",
  },
  {
    title: "內部結構圖",
    purpose: "用剖面或分層示意解釋產品價值，強化材質、厚度、支撐與舒適感。",
    copy: "主標「內部結構透視」；標籤可用通用安全說法如「表層面料」「透氣層」「緩衝層」「支撐層」「防滑底布」。若用戶未提供，不得寫 EPP、PP、TPR、真皮、防水等具體材質。",
    scene: "產品剖面或爆炸分層視覺，周圍用圓形放大框展示面料紋理、織帶、底部材質；科技感但保持暖橙電商風。",
  },
];
const mainTitles = mainBlueprints.map((item) => item.title);
const detailTitles = ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"];

const evidenceRules = [
  "文案证据规则：每一个卖点标签都必须能从上传图片的可见结构、用户补充信息或商品常识中得到支持；如果不能确认，必须改成更保守的通用词，例如「細節特寫」「清潔便利」「使用方便」。",
  "收納用词规则：只有当商品本身明确是收纳盒、收纳袋、置物篮、置物架，或图片中有清楚的开放收纳空间时，才可使用「收納盒」「收納空間」「收納有序」。如果识别为儿童安全座椅、坐垫、布套、保护垫等软体座垫类商品，底部拉链、底座或缝线不得写成「底部收納空間」或「含收納盒」，应优先写「可拆卸清洗」「清潔便利」「拉鍊設計」「底部加穩」。",
  "细节一致性规则：所有放大圆框、微距图和细节特写都必须像是从同一件上传商品裁切或近距离拍摄得到，必须保留原图中的颜色、扣具形状、织带位置、缝线方向、图案和材质纹理。",
  "扣具一致性规则：如果原图只显示侧边扣、调节扣或织带扣，不要生成中央五点式圆扣、汽车安全带插扣、背包扣或其他不同形状的扣具；若无法准确复现扣具，减少扣具特写，改拍织带、车线或面料。",
  "禁止为了画面丰富而新增原图没有的口袋、拉链、收纳格、固定件、配件包、认证标章或安全结构。",
].join("\n");

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function jobSnapshot(job) {
  return {
    id: job.id,
    status: job.status,
    provider: job.provider,
    model: job.model,
    total: job.results.length,
    completed: job.results.filter((item) => item.status === "done" || item.status === "error").length,
    failed: job.results.filter((item) => item.status === "error").length,
    results: job.results,
    retryable: job.results.some((item) => item.status === "error"),
    error: job.error || "",
  };
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  if (net.isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  return false;
}

function assertRemoteImageUrls(imageUrls, provider) {
  for (const imageUrl of imageUrls) {
    const parsed = new URL(imageUrl);
    if (isPrivateHostname(parsed.hostname) || net.isIP(parsed.hostname)) {
      const label = provider === "banana-pro" ? "PRO 增强 / Banana Pro" : "GPT Image 2";
      throw new Error(
        `${label} 需要公网可访问的图片地址。当前是本地测试地址（${parsed.host}），外部模型无法下载图片。请先部署到 Render 公网域名后使用，或设置 PUBLIC_BASE_URL 为可访问的 HTTPS 域名；本地测试请先使用 seedream5.0。`,
      );
    }
  }
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
    `准确性与细节约束：\n${evidenceRules}`,
    `整体风格：${style}。`,
    "必须保留产品真实外观、颜色、材质纹理、结构比例、可见 Logo/标签和口袋/扣具/边线等关键细节。",
    "画面文字使用台湾繁体中文，不要使用简体字。使用台湾电商常用词，例如：品質、規格、材質、收納、車用、居家、適用、便利、耐看、實用。",
    "广告文案必须短、粗、大，适合手机端浏览；主标题不超过 10 个中文字，卖点标签每个不超过 8 个中文字。",
    "不要凭空增加配件、功能、认证、承重、防水等级、品牌或规格。",
    "遇到規格表、包裝內容、內部結構、適用年齡、適用體重、尺寸、材質等硬資訊時：若用戶沒有提供或圖片無法明確確認，請寫「以賣場資訊為準」或使用通用描述，不要自行編造數字與材料名稱。",
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
  if (first.b64_json) return { url: `data:image/png;base64,${first.b64_json}` };
  if (first.url) return { url: first.url };
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
      if (url) return { url, externalTaskId: taskId };
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
  assertRemoteImageUrls(imageUrls, provider);
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

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function runGenerationJob(job, images, settings, imageUrls) {
  job.status = "running";
  const indexes = job.results.map((_, index) => index);
  await runGenerationItems(job, images, settings, imageUrls, indexes);
}

async function runGenerationItems(job, images, settings, imageUrls, indexes) {
  job.status = "running";
  const concurrency = job.provider === "ark" ? 1 : 3;
  await runWithConcurrency(indexes, concurrency, async (resultIndex) => {
    const item = job.results[resultIndex];
    const index = resultIndex;
    job.results[index] = { ...item, status: "running" };
    try {
      const prompt = promptFor(item, settings);
      const output = await callSelectedImageModel(prompt, images, job.model, job.provider, imageUrls);
      job.results[index] = { ...item, status: "done", url: output.url, prompt, externalTaskId: output.externalTaskId || "" };
    } catch (error) {
      job.results[index] = { ...item, status: "error", error: error.message };
    }
  });

  const hasRunning = job.results.some((item) => item.status === "queued" || item.status === "running");
  const hasError = job.results.some((item) => item.status === "error");
  if (!hasRunning) {
    job.status = hasError ? "partial_failed" : "completed";
    job.finishedAt = Date.now();
  }
}

function mockResult(item, images) {
  return { ...item, status: "done", url: images[item.index % images.length]?.dataUrl || images[0]?.dataUrl || "", mock: true };
}

async function handleGenerate(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    const settings = body.settings || {};
    const model = modelFromSettings(settings);
    const provider = ["gpt-image-2", "banana-pro"].includes(settings.modelProvider) ? settings.modelProvider : "ark";
    const clientRequestId = String(body.clientRequestId || "");
    if (!images.length) return sendJson(res, 400, { error: "请至少上传 1 张产品图。" });

    if (clientRequestId) {
      const existing = [...jobs.values()].find((job) => job.clientRequestId === clientRequestId);
      if (existing) return sendJson(res, 202, { mode: existing.mock ? "mock" : "real", job: jobSnapshot(existing), reused: true });
    }

    let items = selectedOutputs(settings);
    const limit = Number(settings.limit || 0);
    if (Number.isFinite(limit) && limit > 0) items = items.slice(0, limit);
    const job = {
      id: crypto.randomUUID(),
      status: "queued",
      provider,
      model,
      clientRequestId,
      mock: DRY_RUN && provider === "ark",
      createdAt: Date.now(),
      results: items.map((item) => ({ ...item, status: "queued" })),
    };
    jobs.set(job.id, job);

    if (DRY_RUN && provider === "ark") {
      job.status = "completed";
      job.results = items.map((item) => mockResult(item, images));
      job.finishedAt = Date.now();
      return sendJson(res, 202, { mode: "mock", job: jobSnapshot(job) });
    }

    const imageUrls = provider === "ark" ? [] : createPublicImageUrls(req, images);
    job.context = { images, settings, imageUrls };
    runGenerationJob(job, images, settings, imageUrls).catch((error) => {
      job.status = "failed";
      job.error = error.message;
      job.finishedAt = Date.now();
    });
    sendJson(res, 202, { mode: "real", job: jobSnapshot(job) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function handleJob(req, res) {
  const id = decodeURIComponent(req.url.split("?")[0].replace("/api/jobs/", ""));
  const job = jobs.get(id);
  if (!job) return sendJson(res, 404, { error: "任务不存在或已过期。" });
  return sendJson(res, 200, { job: jobSnapshot(job) });
}

function handleRetryFailed(req, res) {
  const id = decodeURIComponent(req.url.split("?")[0].replace("/api/jobs/", "").replace("/retry-failed", ""));
  const job = jobs.get(id);
  if (!job) return sendJson(res, 404, { error: "任务不存在或已过期。" });
  if (["queued", "running"].includes(job.status)) return sendJson(res, 409, { error: "任务仍在生成中，请等待完成后再重试失败项。" });

  const failedIndexes = job.results.map((item, index) => (item.status === "error" ? index : -1)).filter((index) => index >= 0);
  if (!failedIndexes.length) return sendJson(res, 200, { job: jobSnapshot(job), message: "没有需要重试的失败项。" });
  if (!job.context) return sendJson(res, 409, { error: "当前任务缺少原始上下文，无法只重试失败项。请重新上传后生成。" });

  for (const index of failedIndexes) {
    const item = job.results[index];
    job.results[index] = { type: item.type, kind: item.kind, title: item.title, index: item.index, status: "queued" };
  }
  runGenerationItems(job, job.context.images, job.context.settings, job.context.imageUrls, failedIndexes).catch((error) => {
    job.status = "partial_failed";
    job.error = error.message;
    job.finishedAt = Date.now();
  });
  return sendJson(res, 202, { job: jobSnapshot(job), retried: failedIndexes.length });
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
  const publicFiles = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/app.js", "app.js"],
    ["/styles.css", "styles.css"],
  ]);
  const publicFile = publicFiles.get(rawPath);
  if (!publicFile) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const filePath = path.join(root, publicFile);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") return sendJson(res, 200, { hasApiKey: Boolean(ARK_API_KEY), dryRun: DRY_RUN, model: ARK_MODEL, models: allowedModels });
  if (req.url === "/api/generate" && req.method === "POST") return handleGenerate(req, res);
  if (req.url.startsWith("/api/jobs/") && req.method === "GET") return handleJob(req, res);
  if (req.url.startsWith("/api/jobs/") && req.url.includes("/retry-failed") && req.method === "POST") return handleRetryFailed(req, res);
  if (req.url.startsWith("/uploads/")) return serveUpload(req, res);
  serveStatic(req, res);
});

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if ((job.finishedAt || job.createdAt) < cutoff) jobs.delete(id);
  }
  for (const [id, upload] of uploadStore.entries()) {
    if (upload.createdAt < cutoff) uploadStore.delete(id);
  }
}, 15 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Shopee AI Studio running at http://127.0.0.1:${PORT}`);
  console.log(`Ark mode: ${DRY_RUN ? "mock (set ARK_API_KEY to enable real calls)" : "real"} | model: ${ARK_MODEL}`);
});
