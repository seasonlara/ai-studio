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
    limitOptions: [["6", "生成 6 张详情页"]],
  },
};

const outputs = {
  main: ["全方位主視覺", "防護支撐圖", "折疊多角度圖", "升級比較圖", "商品規格表", "細節特寫圖", "包裝內容圖", "使用情境圖", "內部結構圖"],
  detailFront: ["功能總覽", "痛點共鳴", "解決方案", "功能矩陣", "核心結構", "規格概覽"],
  detailBack: ["便攜賣點", "折疊展示", "舒適體驗", "傳統痛點", "受力固定", "規格補充"],
};

let uploadedImages = [];
let currentMode = "main";
let currentQuality = "standard";
let activeJobPoll = null;
let currentJobId = localStorage.getItem("activeGenerationJobId") || "";
const modeJobIds = { main: currentJobId, detail: "" };
const resultStates = { main: { type: "empty" }, detail: { type: "empty" } };
let isSubmitting = false;
let hasUnsavedGeneratedResults = false;
let currentModalItem = null;
const maxUploadImages = 8;
const $ = (id) => document.getElementById(id);

function isLocalPreviewHost() {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(window.location.hostname);
}

function isFilePreview() {
  return window.location.protocol === "file:";
}

function dealEnabled() {
  return Boolean($("includeDetailDeal")?.checked && currentMode === "main");
}

function selectedOutputs() {
  const selected = [];
  if (modes[currentMode].includeMain) {
    selected.push(...outputs.main.map((title, index) => ({ type: "主图", kind: "main", title, index: index + 1 })));
  }
  if (modes[currentMode].includeDetail || dealEnabled()) {
    const batch = currentMode === "detail" && $("detailBatch")?.value === "back" ? "back" : "front";
    const detailList = batch === "back" ? outputs.detailBack : outputs.detailFront;
    const offset = batch === "back" ? 6 : 0;
    selected.push(...detailList.map((title, index) => ({ type: "详情页", kind: "detail", title, index: offset + index + 1 })));
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
  if (uploadedImages.length && provider !== "ark" && isLocalPreviewHost()) {
    $("generateSubtext").textContent = `${providerLabels[provider]} · 本地测试需公网图片地址`;
  } else {
    $("generateSubtext").textContent = uploadedImages.length ? `消耗 ${cost} 积分` : `${providerLabels[provider]} · 上传图片后可生成`;
  }
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".content-option").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  if (mode === "detail") $("includeDetailDeal").checked = false;
  $("detailBatchField").hidden = mode !== "detail";
  $("detailDealStrip").hidden = mode === "detail";
  syncLimitOptions();
  updateSummary();
  syncCurrentJobId();
  renderResultState(resultStates[currentMode]);
}

function selectProvider(provider) {
  $("modelProvider").value = provider;
  updateSummary();
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    if (preview.startsWith("<!doctype") || preview.startsWith("<html") || preview.includes("<title>")) {
      throw new Error(`${fallbackMessage}：服务返回了网页内容而不是任务数据。请刷新页面后重试；如果刚部署过，请等待部署完成。`);
    }
    throw new Error(`${fallbackMessage}：服务返回了非 JSON 内容（HTTP ${response.status}）。${preview}`);
  }
}

function readableNetworkError(error, fallbackMessage) {
  const message = String(error?.message || error || "");
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return `${fallbackMessage}：无法连接生成服务。请确认当前页面使用的是本地测试地址或公网部署地址，并检查服务是否仍在运行。`;
  }
  return message || fallbackMessage;
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
      detailBatch: $("detailBatch")?.value || "front",
      outputLanguage: $("outputLanguage").value,
      productName: $("productName").value.trim(),
      coreBenefit: $("coreBenefit").value.trim(),
      extraInfo: $("extraInfo").value.trim(),
      constraints: $("constraints").value.trim(),
    },
  };
}

function setGenerateButtonState(disabled, label = "生成图像") {
  const button = $("generateBtn");
  button.disabled = disabled;
  $("generateLabel").textContent = label;
}

function setUnsavedGeneratedResults(value) {
  hasUnsavedGeneratedResults = Boolean(value);
}

function stateHasGeneratedResult(state) {
  if (!state || state.type === "empty") return false;
  const items = state.job?.results || state.items || [];
  return items.some((item) => (item.status === "done" || item.url) && !item.error);
}

function syncUnsavedGeneratedResults() {
  setUnsavedGeneratedResults(Object.values(resultStates).some(stateHasGeneratedResult));
}

function saveResultState(mode, state) {
  resultStates[mode] = state;
  syncUnsavedGeneratedResults();
}

function syncCurrentJobId() {
  currentJobId = modeJobIds[currentMode] || "";
}

function successfulResultItems(state = resultStates[currentMode]) {
  if (!state || state.type === "empty") return [];
  const items = state.job?.results || state.items || [];
  return items.filter((item) => (item.status === "done" || item.url) && item.url && !item.error);
}

function updateDownloadAllButton() {
  const button = $("downloadAllBtn");
  if (!button) return;
  const count = successfulResultItems().length;
  button.disabled = !count;
  button.textContent = count ? `一键下载 (${count})` : "一键下载";
}

function showResultsPanel() {
  $("resultsPanel").hidden = false;
}

function hideResultsPanel() {
  $("resultsPanel").hidden = true;
}

function renderResultState(state) {
  if (!state || state.type === "empty") {
    const grid = $("resultGrid");
    grid.className = "result-grid empty-state";
    grid.innerHTML = `<div><strong>等待生成</strong><span>完成后会在这里显示图片。</span></div>`;
    hideResultsPanel();
    $("resultHint").textContent = "结果会保留在当前页面，可点击图片放大查看。";
    $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
    setGenerateButtonState(false);
    updateDownloadAllButton();
    return;
  }
  if (state.type === "pending") return renderPendingCards(state.items, currentMode, false);
  if (state.type === "finished") return renderFinishedCards(state.items, currentMode, false);
  if (state.type === "job") return renderJob(state.job, currentMode, false);
}

function renderPendingCards(items, mode = currentMode, persist = true) {
  if (persist) saveResultState(mode, { type: "pending", items });
  if (mode !== currentMode) return;
  showResultsPanel();
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  syncUnsavedGeneratedResults();
  items.forEach((item, index) => grid.appendChild(createImageCard({ ...item, resultIndex: index }, "生成中")));
  $("taskStatus").textContent = "生成中";
  $("taskCount").textContent = `正在生成 ${items.length} 张图片`;
  $("resultHint").textContent = `正在使用 ${providerLabels[$("modelProvider").value]} 生成，请保持当前页面打开。`;
  updateDownloadAllButton();
}

function renderFinishedCards(items, mode = currentMode, persist = true) {
  if (persist) saveResultState(mode, { type: "finished", items });
  if (mode !== currentMode) return;
  showResultsPanel();
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  items.forEach((item, index) => grid.appendChild(createImageCard({ ...item, resultIndex: index }, item.error ? "失败" : "已完成")));
  syncUnsavedGeneratedResults();
  const failed = items.filter((item) => item.error).length;
  $("taskStatus").textContent = failed ? "部分失败" : "已完成";
  $("taskCount").textContent = `一次生成即得 ${items.length} 张精选图`;
  $("resultHint").textContent = failed ? `${failed} 张生成失败，可调整图片或补充信息后重试。` : "图片已生成，可点击图片放大查看。";
  updateDownloadAllButton();
}

function renderJob(job, mode = currentMode, persist = true) {
  if (persist) saveResultState(mode, { type: "job", job });
  modeJobIds[mode] = job.id || modeJobIds[mode] || "";
  syncCurrentJobId();
  if (mode !== currentMode) return;
  showResultsPanel();
  currentJobId = job.id || currentJobId;
  if (currentJobId && !["completed", "partial_failed", "failed"].includes(job.status)) {
    localStorage.setItem("activeGenerationJobId", currentJobId);
  }
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = "";
  const items = job.results || [];
  items.forEach((item, index) => {
    const label = item.status === "done" ? "已完成" : item.status === "error" ? "失败" : item.status === "running" ? "生成中" : "排队中";
    grid.appendChild(createImageCard({ ...item, resultIndex: index }, label));
  });
  syncUnsavedGeneratedResults();

  const completed = job.completed || items.filter((item) => item.status === "done" || item.status === "error").length;
  const total = job.total || items.length;
  const failed = job.failed || items.filter((item) => item.status === "error").length;
  const finished = ["completed", "partial_failed", "failed"].includes(job.status);

  $("taskStatus").textContent = finished ? (failed ? "部分失败" : "已完成") : "生成中";
  $("taskCount").textContent = finished ? `已完成 ${completed} / ${total} 张` : `正在生成 ${completed} / ${total} 张`;
  $("resultHint").textContent = finished
    ? failed
      ? `${failed} 张生成失败，可调整图片或补充信息后重试。`
      : "图片已生成，可点击图片放大查看。"
    : "任务已提交，系统会自动刷新生成进度。";
  setGenerateButtonState(!finished, finished ? "生成图像" : "生成中...");
  if (job.status === "completed" || job.status === "failed") localStorage.removeItem("activeGenerationJobId");
  updateDownloadAllButton();
}

async function pollJob(jobId, mode = currentMode) {
  if (activeJobPoll) clearTimeout(activeJobPoll);
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const data = await readJsonResponse(res, "查询任务失败");
    if (!res.ok) throw new Error(data.error || "查询任务失败");
    const job = data.job;
    renderJob(job, mode);
    if (!["completed", "partial_failed", "failed"].includes(job.status)) {
      activeJobPoll = setTimeout(() => pollJob(jobId, mode), 3000);
    } else {
      activeJobPoll = null;
      setGenerateButtonState(false);
    }
  } catch (error) {
    renderError(readableNetworkError(error, "查询任务失败"));
    activeJobPoll = null;
    setGenerateButtonState(false);
  }
}

async function retryFailedJob(jobId) {
  if (!jobId || isSubmitting) return;
  const mode = currentMode;
  isSubmitting = true;
  setGenerateButtonState(true, "重试中...");
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry-failed`, { method: "POST" });
    const data = await readJsonResponse(res, "重试失败项失败");
    if (!res.ok) throw new Error(data.error || "重试失败项失败");
    renderJob(data.job, mode);
    pollJob(data.job.id, mode);
  } catch (error) {
    renderError(readableNetworkError(error, "重试失败项失败"));
    setGenerateButtonState(false);
  } finally {
    isSubmitting = false;
  }
}

async function regenerateResultItem(item) {
  if (!currentJobId || !Number.isInteger(item.resultIndex) || isSubmitting) return;
  const mode = currentMode;
  isSubmitting = true;
  setGenerateButtonState(true, "重新生成中...");
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(currentJobId)}/retry-item/${item.resultIndex}`, { method: "POST" });
    const data = await readJsonResponse(res, "重新生成失败");
    if (!res.ok) throw new Error(data.error || "重新生成失败");
    renderJob(data.job, mode);
    pollJob(data.job.id, mode);
  } catch (error) {
    renderError(readableNetworkError(error, "重新生成失败"));
    setGenerateButtonState(false);
  } finally {
    isSubmitting = false;
  }
}

function renderError(message) {
  showResultsPanel();
  const grid = $("resultGrid");
  grid.classList.remove("empty-state");
  grid.innerHTML = `<div class="error-box"><strong>生成失败</strong><br>${message}</div>`;
  syncUnsavedGeneratedResults();
  $("taskStatus").textContent = "失败";
  setGenerateButtonState(false);
  updateDownloadAllButton();
}

function openImageModal(item) {
  if (!item.url || item.error) return;
  const displayTitle = imageDisplayTitle(item);
  currentModalItem = item;
  $("modalImage").src = item.url;
  $("modalImage").alt = displayTitle;
  $("modalTitle").textContent = displayTitle;
  $("modalDownload").href = "#";
  $("modalDownload").download = imageDownloadName(item);
  $("imageModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  $("imageModal").hidden = true;
  currentModalItem = null;
  $("modalImage").removeAttribute("src");
  document.body.classList.remove("modal-open");
}

function extractCoreProductName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const segments = text.split(/[\s,，、;；:：|｜/／\\\-—_]+/).map((item) => item.trim()).filter(Boolean);
  const candidate = segments.find((item) => /[\u4e00-\u9fa5A-Za-z0-9]/.test(item)) || "";
  return candidate.slice(0, 14);
}

function imageDisplayTitle(item) {
  const baseTitle = `${item.type} ${String(item.index).padStart(2, "0")}｜${item.title}`;
  const productName = extractCoreProductName($("productName")?.value);
  return productName ? `${productName}-${baseTitle}` : baseTitle;
}

function imageDownloadName(item) {
  return `${imageDisplayTitle(item).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")}.png`;
}

function safeFileSegment(value, fallback = "商品") {
  return String(value || fallback).trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").slice(0, 60) || fallback;
}

function todayStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function downloadBundleName(items) {
  const productTitle = safeFileSegment($("productName")?.value, "商品");
  const kinds = new Set(items.map((item) => item.kind || (item.type === "主图" ? "main" : "detail")));
  const typeText = kinds.size === 1 ? ([...kinds][0] === "main" ? "主图" : "详情图") : "主图详情图";
  return `${productTitle}-${typeText}-${items.length}张-${todayStamp()}`;
}

async function downloadAllResults() {
  const items = successfulResultItems();
  if (!items.length || isSubmitting) return;
  const button = $("downloadAllBtn");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "打包中...";
  try {
    const bundleName = downloadBundleName(items);
    const response = await fetch("/api/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zipName: bundleName,
        folderName: bundleName,
        files: items.map((item) => ({
          name: imageDownloadName(item),
          url: item.url,
        })),
      }),
    });
    if (!response.ok) {
      const data = await readJsonResponse(response, "打包下载失败");
      throw new Error(data.error || "打包下载失败");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${bundleName}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    alert(readableNetworkError(error, "打包下载失败"));
  } finally {
    button.textContent = previousText;
    updateDownloadAllButton();
  }
}

async function downloadSingleResult(item, trigger) {
  if (!item.url || item.error || isSubmitting) return;
  const previousText = trigger?.textContent;
  if (trigger) {
    trigger.classList.add("disabled");
    trigger.textContent = "下载中...";
  }
  try {
    const fileName = imageDownloadName(item);
    const response = await fetch("/api/download-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, url: item.url }),
    });
    if (!response.ok) {
      const data = await readJsonResponse(response, "下载失败");
      throw new Error(data.error || "下载失败");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    alert(readableNetworkError(error, "下载失败"));
  } finally {
    if (trigger) {
      trigger.classList.toggle("disabled", !item.url || item.error);
      trigger.textContent = previousText || "下载";
    }
  }
}

function createImageCard(item, status) {
  const card = document.createElement("article");
  card.className = "image-card";
  const isPending = !item.error && !item.url;
  if (isPending) card.classList.add("is-pending");

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
    const displayTitle = imageDisplayTitle(item);
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = displayTitle;
    const zoomButton = document.createElement("button");
    zoomButton.type = "button";
    zoomButton.className = "image-zoom-button";
    zoomButton.setAttribute("aria-label", `查看大图：${displayTitle}`);
    zoomButton.addEventListener("click", () => openImageModal(item));
    zoomButton.appendChild(img);
    image.appendChild(zoomButton);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "generation-placeholder";
    placeholder.innerHTML = `
      <span class="generation-spinner" aria-hidden="true"></span>
      <strong>${status === "排队中" ? "等待排队" : "正在生成"}</strong>
      <small>AI 正在绘制这张图片</small>
    `;
    image.appendChild(placeholder);
  }
  image.appendChild(badge);

  const caption = document.createElement("div");
  caption.className = "image-caption";
  const title = document.createElement("strong");
  title.textContent = imageDisplayTitle(item);
  const meta = document.createElement("span");
  meta.textContent = item.error ? "生成失败" : item.url ? "1:1 电商图" : "生成完成后可下载";
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const download = document.createElement("a");
  download.textContent = "下载";
  download.href = "#";
  download.download = imageDownloadName(item);
  if (!item.url || item.error) download.classList.add("disabled");
  download.addEventListener("click", (event) => {
    event.preventDefault();
    if (!item.url || item.error) return;
    downloadSingleResult(item, download);
  });

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重新生成";
  retry.disabled = item.status === "queued" || item.status === "running";
  retry.addEventListener("click", () => {
    if (currentJobId && Number.isInteger(item.resultIndex)) {
      regenerateResultItem(item);
    } else if (item.status === "error" && currentJobId) {
      retryFailedJob(currentJobId);
    } else {
      generateImages();
    }
  });

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
  if (isSubmitting) return;
  if (!$("productName").value.trim()) {
    alert("请先填写产品标题。");
    $("productName").focus();
    return;
  }
  if (isFilePreview()) {
    renderError("当前是直接打开的 HTML 文件，无法连接生成服务。请使用本地测试地址 http://127.0.0.1:8792/ 或公网网站访问后再生成。");
    return;
  }
  if (!uploadedImages.length) {
    renderError("请先上传至少 1 张商品图片。");
    return;
  }

  isSubmitting = true;
  setGenerateButtonState(true, "提交中...");
  if (activeJobPoll) {
    clearTimeout(activeJobPoll);
    activeJobPoll = null;
  }
  const mode = currentMode;
  currentJobId = "";
  modeJobIds[mode] = "";
  localStorage.removeItem("activeGenerationJobId");
  const selected = visibleOutputs();
  renderPendingCards(selected, mode);
  try {
    const clientRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload(), clientRequestId }),
    });
    const data = await readJsonResponse(res, "提交任务失败");
    if (!res.ok) throw new Error(data.error || "生成请求失败");
    if (data.job?.id) {
      currentJobId = data.job.id;
      modeJobIds[mode] = data.job.id;
      localStorage.setItem("activeGenerationJobId", currentJobId);
      renderJob(data.job, mode);
      pollJob(data.job.id, mode);
    } else {
      renderFinishedCards(data.results || [], mode);
    }
  } catch (error) {
    renderError(readableNetworkError(error, "提交任务失败"));
  } finally {
    isSubmitting = false;
  }
}

function clearResults(resetStatus = true) {
  if (activeJobPoll) {
    clearTimeout(activeJobPoll);
    activeJobPoll = null;
  }
  currentJobId = "";
  modeJobIds[currentMode] = "";
  saveResultState(currentMode, { type: "empty" });
  localStorage.removeItem("activeGenerationJobId");
  const grid = $("resultGrid");
  grid.className = "result-grid empty-state";
  grid.innerHTML = `<div><strong>等待生成</strong><span>完成后会在这里显示图片。</span></div>`;
  syncUnsavedGeneratedResults();
  hideResultsPanel();
  $("resultHint").textContent = "结果会保留在当前页面，可点击图片放大查看。";
  if (resetStatus) $("taskStatus").textContent = uploadedImages.length ? "图片已就绪" : "等待上传";
  setGenerateButtonState(false);
  updateDownloadAllButton();
}

function setupUnsavedResultGuard() {
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedGeneratedResults) return;
    event.preventDefault();
    event.returnValue = "";
  });
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
  $("detailDealStrip").hidden = currentMode === "detail";
  document.querySelectorAll(".content-option").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      currentQuality = button.dataset.quality === "pro" ? "pro" : "standard";
      syncLimitOptions();
      updateSummary();
      renderResultState(resultStates[currentMode]);
    });
  });
  $("imageInput").addEventListener("change", (event) => {
    previewFiles(event.target.files);
    event.target.value = "";
  });
  $("limit").addEventListener("change", updateSummary);
  $("detailBatch").addEventListener("change", () => {
    syncLimitOptions();
    updateSummary();
    renderResultState(resultStates[currentMode]);
  });
  $("modelProvider").addEventListener("change", (event) => selectProvider(event.target.value));
  $("stylePreset").addEventListener("change", updateSummary);
  $("includeDetailDeal").addEventListener("change", () => {
    syncLimitOptions();
    updateSummary();
  });
  $("modalClose").addEventListener("click", closeImageModal);
  $("modalDownload").addEventListener("click", (event) => {
    event.preventDefault();
    if (currentModalItem) downloadSingleResult(currentModalItem, $("modalDownload"));
  });
  $("imageModal").addEventListener("click", (event) => {
    if (event.target.dataset.closeModal !== undefined) closeImageModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("imageModal").hidden) closeImageModal();
  });
  $("generateBtn").addEventListener("click", generateImages);
  $("downloadAllBtn").addEventListener("click", downloadAllResults);
  $("clearBtn").addEventListener("click", () => clearResults(true));
  setupDragUpload();
  setupUnsavedResultGuard();
  syncLimitOptions();
  updateSummary();
  if (currentJobId) {
    $("taskStatus").textContent = "恢复任务";
    $("resultHint").textContent = "检测到未完成任务，正在恢复查询。";
    pollJob(currentJobId);
  }
}

setup();
