const model = "doubao-seedream-5-0-260128";
const providerLabels = {
  ark: "seedream5.0",
  "gpt-image-2": "GPT Image 2",
  "banana-pro": "Banana Pro",
};

const modes = {
  main: {
    nav: "主图生成",
    includeMain: true,
    includeDetail: false,
    subtext: "一次生成即得专业主图",
    limitOptions: [["9", "标准生成 9 张主图"]],
  },
  detail: {
    nav: "详情页",
    includeMain: false,
    includeDetail: true,
    subtext: "生成商品详情页说明图",
    limitOptions: [
      ["1", "先生成 1 张"],
      ["4", "生成 4 张"],
      ["9", "生成全部"],
    ],
  },
};

const outputs = {
  main: ["全方位主視覺", "防護支撐圖", "折疊多角度圖", "升級比較圖", "商品規格表", "細節特寫圖", "包裝內容圖", "使用情境圖", "內部結構圖"],
  detail: ["核心卖点总览", "安装/使用流程", "升级比较图", "多角度展示", "材质结构图", "细节特写图", "使用情境图", "包装内容图", "规格参数表"],
};

let uploadedImages = [];
let currentMode = "main";
let currentQuality = "standard";
const maxUploadImages = 8;
const $ = (id) => document.getElementById(id);

function dealEnabled() {
  return Boolean($("includeDetailDeal")?.checked && currentMode === "main");
}

function selectedOutputs() {
  const selected = [];
  if (modes[currentMode].includeMain) {
    selected.push(...outputs.main.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 })));
  }
  if (modes[currentMode].includeDetail || dealEnabled()) {
    const detailList = dealEnabled() ? outputs.detail.slice(0, 6) : outputs.detail;
    selected.push(...detailList.map((title, index) => ({ type: "详情页", kind: "detail", title, index: index + 1 })));
  }
  return selected;
}

function visibleOutputs() {
  return selectedOutputs().slice(0, Number($("limit").value || 1));
}

function syncLimitOptions() {
  const select = $("limit");
  const previous = select.value;
  let options = modes[currentMode].limitOptions;
  if (currentMode === "main") {
    options = currentQuality === "pro" ? [["1", "PRO 生成 1 张主图"]] : [["9", "标准生成 9 张主图"]];
    if (dealEnabled()) {
      options = currentQuality === "pro" ? [["7", "1 张主图 + 前六屏详情"]] : [["15", "9 张主图 + 前六屏详情"]];
    }
  }

  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  } else {
    select.value = options[options.length - 1][0];
  }
}

function taskCost(count) {
  if (dealEnabled()) return currentQuality === "pro" ? 199 : 299;
  if (currentQuality === "pro") return 100;
  if (currentMode === "main") return 199;
  if ($("modelProvider").value !== "ark") return count * 100;
  return count * 15;
}

function updateSummary() {
  const count = visibleOutputs().length;
  const cost = taskCost(count);
  const provider = $("modelProvider").value;
  $("summaryScope").textContent = `剩余积分`;
  $("taskCount").textContent = `一次生成即得 ${count} 张${currentMode === "main" ? "专业主图" : "精选图"}`;
  $("generateSubtext").textContent = uploadedImages.length ? `消耗 ${cost} 积分` : `${providerLabels[provider]} · 上传图片后可生成`;
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".content-option").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  if (mode === "detail") $("includeDetailDeal").checked = false;
  syncLimitOptions();
  updateSummary();
  clearResults(false);
}

function selectProvider(provider) {
  $("modelProvider").value = provider;
  updateSummary();
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
  const availableSlots = Math.max(maxUploadImages - uploadedImages.length, 0);
  const nextImages = await Promise.all(
    [...files].slice(0, availableSlots).map(async (file) => ({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      file,
      objectUrl: URL.createObjectURL(file),
      ...(await readFileAsDataUrl(file)),
    })),
  );

  uploadedImages = [...uploadedImages, ...nextImages];
  renderUploadList();
}

function removeUploadedImage(id) {
  const target = uploadedImages.find((item) => item.id === id);
  if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
  uploadedImages = uploadedImages.filter((item) => item.id !== id);
  renderUploadList();
}

function renderUploadList() {
  const grid = $("previewGrid");
  grid.innerHTML = "";

  uploadedImages.forEach((item, index) => {
    const tile = document.createElement("div");
    tile.className = "upload-preview-tile";

    const img = document.createElement("img");
    img.src = item.objectUrl;
    img.alt = item.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "upload-remove-button";
    remove.setAttribute("aria-label", `移除第 ${index + 1} 张图片`);
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeUploadedImage(item.id);
    });

    tile.appendChild(img);
    tile.appendChild(remove);
    grid.appendChild(tile);
  });

  $("uploadAddTile").hidden = uploadedImages.length >= maxUploadImages;
  $("uploadCount").textContent = `已选择 ${uploadedImages.length} / ${maxUploadImages} 张图片`;
  $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
  updateSummary();
}

function payload() {
  const effectiveIncludeDetail = modes[currentMode].includeDetail || dealEnabled();
  return {
    images: uploadedImages.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
    settings: {
      category: $("category").value,
      goal: $("goal").value,
      model,
      modelProvider: $("modelProvider").value,
      limit: Number($("limit").value || 1),
      stylePreset: $("stylePreset").value,
      generationQuality: currentQuality,
      includeMain: modes[currentMode].includeMain,
      includeDetail: effectiveIncludeDetail,
      outputLanguage: $("outputLanguage").value,
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
  $("taskCount").textContent = `正在生成 ${items.length} 张图片`;
  $("resultHint").textContent = `正在使用 ${providerLabels[$("modelProvider").value]} 生成，请保持当前页面打开。`;
}

function renderFinishedCards(items) {
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  items.forEach((item) => grid.appendChild(createImageCard(item, item.error ? "失败" : "已完成")));
  const failed = items.filter((item) => item.error).length;
  $("taskStatus").textContent = failed ? "部分失败" : "已完成";
  $("taskCount").textContent = `一次生成即得 ${items.length} 张精选图`;
  $("resultHint").textContent = failed ? `${failed} 张生成失败，可调整图片或补充信息后重试。` : "图片已生成，可点击图片放大查看。";
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
  $("resultHint").textContent = "结果会保留在当前页面，可点击图片放大查看。";
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
  document.querySelectorAll(".content-option").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      currentQuality = button.dataset.quality === "pro" ? "pro" : "standard";
      selectProvider(currentQuality === "pro" ? "banana-pro" : "ark");
      syncLimitOptions();
      updateSummary();
      clearResults(false);
    });
  });
  $("imageInput").addEventListener("change", (event) => {
    previewFiles(event.target.files);
    event.target.value = "";
  });
  $("limit").addEventListener("change", updateSummary);
  $("modelProvider").addEventListener("change", (event) => selectProvider(event.target.value));
  $("stylePreset").addEventListener("change", updateSummary);
  $("includeDetailDeal").addEventListener("change", () => {
    syncLimitOptions();
    updateSummary();
  });
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
  syncLimitOptions();
  updateSummary();
}

setup();
