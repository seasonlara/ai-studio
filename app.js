const outputs = {
  main: ["爆款主视觉", "场景使用图", "痛点解决图", "卖点标签图", "材质细节图", "升级对比图", "安心出货图"],
  detail: ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"],
};

let uploadedImages = [];
const $ = (id) => document.getElementById(id);

function getSelectedOutputs() {
  const selected = [];
  if ($("includeMain").checked) selected.push(...outputs.main.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 })));
  if ($("includeDetail").checked) selected.push(...outputs.detail.map((title, index) => ({ type: "详情页", kind: "detail", title, index: index + 1 })));
  if (!selected.length) {
    $("includeMain").checked = true;
    return getSelectedOutputs();
  }
  return selected;
}

function updateCost() {
  const requested = Number($("limit").value || getSelectedOutputs().length);
  const count = Math.min(getSelectedOutputs().length, requested);
  const cost = count === 16 ? 199 : count * 15;
  $("buttonCost").textContent = cost;
  const scope = `${$("includeMain").checked ? "7 张主图" : ""}${$("includeMain").checked && $("includeDetail").checked ? " + " : ""}${$("includeDetail").checked ? "9 张详情页" : ""}`;
  $("generationSummary").textContent = `${scope}｜本次 ${count} 张`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function previewFiles(files) {
  uploadedImages.forEach((item) => item.objectUrl && URL.revokeObjectURL(item.objectUrl));
  uploadedImages = await Promise.all(
    [...files].slice(0, 8).map(async (file) => ({
      file,
      objectUrl: URL.createObjectURL(file),
      ...(await readFileAsDataUrl(file)),
    })),
  );
  const grid = $("previewGrid");
  grid.innerHTML = "";
  uploadedImages.forEach((item) => {
    const img = document.createElement("img");
    img.src = item.objectUrl;
    img.alt = item.name;
    grid.appendChild(img);
  });
  $("uploadEmpty").hidden = uploadedImages.length > 0;
  grid.hidden = uploadedImages.length === 0;
  $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
}

async function refreshHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    $("apiMode").textContent = data.hasApiKey ? `真实 API · ${data.model}` : "模拟模式";
  } catch {
    $("apiMode").textContent = "静态预览";
  }
}

function payload() {
  return {
    images: uploadedImages.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
    settings: {
      category: $("category").value,
      model: $("model").value,
      limit: Number($("limit").value || 1),
      stylePreset: $("stylePreset").value,
      includeMain: $("includeMain").checked,
      includeDetail: $("includeDetail").checked,
      productName: $("productName").value.trim(),
      coreBenefit: $("coreBenefit").value.trim(),
      extraInfo: $("extraInfo").value.trim(),
      constraints: $("constraints").value.trim(),
    },
  };
}

function renderPendingCards(items) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  items.forEach((item) => grid.appendChild(createImageCard(item, "生成中")));
  $("taskStatus").textContent = "生成中";
  $("taskCount").textContent = `${items.length} 张图片`;
  $("resultHint").textContent = `正在请求火山引擎 Ark，模型：${$("model").value}。`;
}

function renderFinishedCards(items) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  items.forEach((item) => grid.appendChild(createImageCard(item, item.error ? "失败" : "已完成")));
  $("taskStatus").textContent = items.some((item) => item.error) ? "部分失败" : "已完成";
  $("taskCount").textContent = `${items.length} 张图片`;
  const failed = items.filter((item) => item.error).length;
  $("resultHint").textContent = failed ? `已返回，${failed} 张失败。请查看失败卡片上的原因。` : "图片已返回。下一阶段会加入保存作品、积分扣费和真实下载管理。";
}

function renderError(message) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = `<div class="error-box"><strong>生成失败</strong><br>${message}</div>`;
  $("taskStatus").textContent = "失败";
}

function createImageCard(item, status) {
  const card = document.createElement("article");
  card.className = "image-card";
  const image = document.createElement("div");
  image.className = "image-mock";
  const badge = document.createElement("div");
  badge.className = "image-badge";
  badge.textContent = status;

  if (item.error) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = item.error;
    image.appendChild(placeholder);
  } else if (item.url) {
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.title;
    image.appendChild(img);
  } else if (uploadedImages[0]) {
    const img = document.createElement("img");
    img.src = uploadedImages[item.index % uploadedImages.length]?.objectUrl || uploadedImages[0].objectUrl;
    img.alt = item.title;
    image.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = item.error || "等待图片";
    image.appendChild(placeholder);
  }
  image.appendChild(badge);

  const caption = document.createElement("div");
  caption.className = "image-caption";
  const title = document.createElement("strong");
  title.textContent = `${item.type} ${String(item.index).padStart(2, "0")}｜${item.title}`;
  const meta = document.createElement("span");
  meta.textContent = item.error ? "生成失败 · 点击重新生成待接入" : item.mock ? "模拟结果 · 待配置 Ark API Key" : "Ark API · 台湾虾皮 · 1:1";
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.innerHTML = `<button type="button">下载</button><button type="button">重新生成</button>`;
  caption.appendChild(title);
  caption.appendChild(meta);
  caption.appendChild(actions);
  card.appendChild(image);
  card.appendChild(caption);
  return card;
}

async function generateImages() {
  updateCost();
  if (!uploadedImages.length) {
    renderError("请先上传至少 1 张产品图。");
    return;
  }
  const selected = getSelectedOutputs().slice(0, Number($("limit").value || 1));
  renderPendingCards(selected);
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "生成请求失败");
    renderFinishedCards(data.results || []);
    if (data.mode) $("apiMode").textContent = data.mode === "real" ? `真实 API · ${data.model || $("model").value}` : "模拟模式";
  } catch (error) {
    renderError(error.message);
  }
}

function clearResults() {
  const grid = $("resultGrid");
  grid.className = "result-grid empty-state";
  grid.innerHTML = `<div><strong>等待生成</strong><span>上传产品图后点击“生成图像”，这里会显示主图和详情页结果。</span></div>`;
  $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
  $("taskCount").textContent = "未创建";
  $("resultHint").textContent = "配置 Ark API Key 后会直接返回图片；未配置密钥时显示模拟结果。";
}

function setupDragUpload() {
  const dropZone = $("dropZone");
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    previewFiles(event.dataTransfer.files);
  });
}

function setup() {
  $("imageInput").addEventListener("change", (event) => previewFiles(event.target.files));
  $("includeMain").addEventListener("change", updateCost);
  $("includeDetail").addEventListener("change", updateCost);
  $("limit").addEventListener("change", updateCost);
  $("model").addEventListener("change", updateCost);
  $("generateBtn").addEventListener("click", generateImages);
  $("clearBtn").addEventListener("click", clearResults);
  setupDragUpload();
  updateCost();
  refreshHealth();
}

setup();
