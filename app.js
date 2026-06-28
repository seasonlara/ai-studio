const model = "doubao-seedream-5-0-260128";
const providerLabels = {
  ark: "标准稳定",
  "gpt-image-2": "文字排版增强",
  "banana-pro": "创意质感增强",
};

const modes = {
  suite: {
    nav: "一键式生图",
    kicker: "套图工作流",
    title: "一键生成虾皮商品套图",
    description: "适合从一张商品图开始，快速产出上架需要的主图和详情页。",
    hint: "自动组合主图与详情页。",
    action: "开始生成套图",
    subtext: "先测 1 张，满意后再生成全套",
    includeMain: true,
    includeDetail: true,
    limitOptions: [
      ["1", "先生成 1 张"],
      ["4", "生成 4 张"],
      ["16", "生成全部 16 张"],
    ],
  },
  main: {
    nav: "主图生成",
    kicker: "点击率素材",
    title: "生成商品主图",
    description: "围绕首图吸引力、卖点表达和场景感，生成适合列表曝光的图片。",
    hint: "聚焦封面、卖点、场景和对比。",
    action: "开始生成主图",
    subtext: "适合先优化商品曝光",
    includeMain: true,
    includeDetail: false,
    limitOptions: [
      ["1", "先生成 1 张"],
      ["4", "生成 4 张"],
      ["7", "生成全部 7 张"],
    ],
  },
  detail: {
    nav: "详情页生成",
    kicker: "转化说明图",
    title: "生成商品详情页",
    description: "围绕结构说明、材质细节、使用情境和参数信息，补齐商品页内容。",
    hint: "聚焦说明、细节、场景和规格。",
    action: "开始生成详情页",
    subtext: "适合补齐商品页说服力",
    includeMain: false,
    includeDetail: true,
    limitOptions: [
      ["1", "先生成 1 张"],
      ["4", "生成 4 张"],
      ["9", "生成全部 9 张"],
    ],
  },
};

const outputs = {
  main: ["爆款主视觉", "场景使用图", "痛点解决图", "卖点标签图", "材质细节图", "升级对比图", "安心出货图"],
  detail: ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"],
};

let uploadedImages = [];
let currentMode = "suite";
const $ = (id) => document.getElementById(id);

function selectedOutputs(mode = currentMode) {
  const config = modes[mode];
  const selected = [];
  if (config.includeMain) selected.push(...outputs.main.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 })));
  if (config.includeDetail) selected.push(...outputs.detail.map((title, index) => ({ type: "详情页", kind: "detail", title, index: index + 1 })));
  return selected;
}

function visibleOutputs() {
  return selectedOutputs().slice(0, Number($("limit").value || 1));
}

function syncLimitOptions() {
  const select = $("limit");
  const previous = select.value;
  select.innerHTML = "";
  modes[currentMode].limitOptions.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function renderTaskStrip() {
  const list = selectedOutputs();
  const strip = $("taskStrip");
  strip.innerHTML = "";
  list.slice(0, 6).forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item.title;
    strip.appendChild(chip);
  });
  if (list.length > 6) {
    const chip = document.createElement("span");
    chip.textContent = `+${list.length - 6}`;
    strip.appendChild(chip);
  }
}

function updateSummary() {
  const count = visibleOutputs().length;
  const cost = count === 16 ? 199 : count * 15;
  const provider = $("modelProvider").value;
  $("buttonCost").textContent = cost;
  $("summaryScope").textContent = `本次 ${count} 张`;
  $("taskCount").textContent = uploadedImages.length ? `${count} 张图片` : "未创建";
  $("generateSubtext").textContent = provider === "ark" ? modes[currentMode].subtext : `${providerLabels[provider]}，适合先生成 1 张确认效果`;
}

function setMode(mode) {
  currentMode = mode;
  const config = modes[mode];
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("pageKicker").textContent = config.kicker;
  $("pageTitle").textContent = config.title;
  $("pageDescription").textContent = config.description;
  $("modeHint").textContent = config.hint;
  $("generateLabel").textContent = config.action;
  $("generateSubtext").textContent = config.subtext;
  $("currentModeLabel").textContent = config.nav;
  syncLimitOptions();
  renderTaskStrip();
  updateSummary();
  clearResults(false);
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
  updateSummary();
}

function payload() {
  return {
    images: uploadedImages.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
    settings: {
      category: $("category").value,
      goal: $("goal").value,
      model,
      modelProvider: $("modelProvider").value,
      limit: Number($("limit").value || 1),
      stylePreset: $("stylePreset").value,
      includeMain: modes[currentMode].includeMain,
      includeDetail: modes[currentMode].includeDetail,
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
  $("resultHint").textContent = `正在使用${providerLabels[$("modelProvider").value]}生成，请保持当前页面打开。`;
}

function renderFinishedCards(items) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  items.forEach((item) => grid.appendChild(createImageCard(item, item.error ? "失败" : "已完成")));
  const failed = items.filter((item) => item.error).length;
  $("taskStatus").textContent = failed ? "部分失败" : "已完成";
  $("taskCount").textContent = `${items.length} 张图片`;
  $("resultHint").textContent = failed ? `${failed} 张生成失败，可调整图片或补充信息后重试。` : "图片已生成，可下载使用。";
}

function renderError(message) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = `<div class="error-box"><strong>生成失败</strong><br>${message}</div>`;
  $("taskStatus").textContent = "失败";
}

function openImageModal(item) {
  if (!item.url || item.error) return;
  $("modalImage").src = item.url;
  $("modalImage").alt = item.title;
  $("modalTitle").textContent = `${item.type} ${String(item.index).padStart(2, "0")}｜${item.title}`;
  $("modalDownload").href = item.url;
  $("modalDownload").download = `${item.kind}-${String(item.index).padStart(2, "0")}.png`;
  $("imageModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  $("imageModal").hidden = true;
  $("modalImage").removeAttribute("src");
  document.body.classList.remove("modal-open");
}

function createImageCard(item, status) {
  const card = document.createElement("article");
  card.className = "image-card";

  const image = document.createElement("div");
  image.className = "image-stage";

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
    const zoomButton = document.createElement("button");
    zoomButton.type = "button";
    zoomButton.className = "image-zoom-button";
    zoomButton.setAttribute("aria-label", `查看大图：${item.title}`);
    zoomButton.addEventListener("click", () => openImageModal(item));
    zoomButton.appendChild(img);
    image.appendChild(zoomButton);
  } else if (uploadedImages[0]) {
    const img = document.createElement("img");
    img.src = uploadedImages[item.index % uploadedImages.length]?.objectUrl || uploadedImages[0].objectUrl;
    img.alt = item.title;
    image.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "等待图片";
    image.appendChild(placeholder);
  }
  image.appendChild(badge);

  const caption = document.createElement("div");
  caption.className = "image-caption";
  const title = document.createElement("strong");
  title.textContent = `${item.type} ${String(item.index).padStart(2, "0")}｜${item.title}`;
  const meta = document.createElement("span");
  meta.textContent = item.error ? "生成失败" : "1:1 电商图";
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const download = document.createElement("a");
  download.textContent = "下载";
  download.href = item.url || "#";
  download.download = `${item.kind}-${String(item.index).padStart(2, "0")}.png`;
  if (!item.url || item.error) download.classList.add("disabled");

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重试";
  retry.addEventListener("click", generateImages);

  actions.appendChild(download);
  actions.appendChild(retry);
  caption.appendChild(title);
  caption.appendChild(meta);
  caption.appendChild(actions);
  card.appendChild(image);
  card.appendChild(caption);
  return card;
}

async function generateImages() {
  updateSummary();
  if (!uploadedImages.length) {
    renderError("请先上传至少 1 张商品图片。");
    return;
  }

  const selected = visibleOutputs();
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
  } catch (error) {
    renderError(error.message);
  }
}

function clearResults(resetStatus = true) {
  const grid = $("resultGrid");
  grid.className = "result-grid empty-state";
  grid.innerHTML = `<div><strong>等待生成</strong><span>完成后会在这里显示图片。</span></div>`;
  $("resultHint").textContent = "结果会保留在当前页面，可直接下载。";
  if (resetStatus) $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
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
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("imageInput").addEventListener("change", (event) => previewFiles(event.target.files));
  $("limit").addEventListener("change", updateSummary);
  $("modelProvider").addEventListener("change", updateSummary);
  $("stylePreset").addEventListener("change", updateSummary);
  $("modalClose").addEventListener("click", closeImageModal);
  $("imageModal").addEventListener("click", (event) => {
    if (event.target.dataset.closeModal !== undefined) closeImageModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("imageModal").hidden) closeImageModal();
  });
  $("generateBtn").addEventListener("click", generateImages);
  $("clearBtn").addEventListener("click", () => clearResults(true));
  setupDragUpload();
  setMode("suite");
}

setup();
