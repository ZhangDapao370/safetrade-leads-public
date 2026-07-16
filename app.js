const DATA_PATH = "data/leads.json";

const state = {
  leads: [],
  query: "",
  priority: "全部",
  listedType: "全部",
  expandedId: null,
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function leadId(lead) {
  return String(lead.announcement_url || `${lead.project_name}-${lead.symbol}`);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
  } catch {
    return null;
  }
  return null;
}

function linkLabel(url, fallback) {
  const lowered = url.toLowerCase();
  if (lowered.startsWith("mailto:")) return "邮箱";
  if (lowered.includes("github.com")) return "GitHub";
  if (lowered.includes("discord")) return "Discord";
  if (lowered.includes("t.me") || lowered.includes("telegram")) return "Telegram";
  if (lowered.includes("x.com") || lowered.includes("twitter.com")) return "X";
  if (lowered.includes("linkedin.com")) return "LinkedIn";
  if (lowered.includes("youtube.com")) return "YouTube";
  return fallback;
}

function appendLeadLinks(container, lead, labeled) {
  const candidates = [
    ...(Array.isArray(lead.project_links) ? lead.project_links.map((url) => ({ url, fallback: "官网" })) : []),
    ...(Array.isArray(lead.contact_links) ? lead.contact_links.map((url) => ({ url, fallback: "项目入口" })) : []),
  ];
  const seen = new Set();
  const valid = candidates.filter(({ url }) => {
    const safe = safeUrl(url);
    if (!safe || seen.has(safe)) return false;
    seen.add(safe);
    return true;
  });

  if (!valid.length) {
    container.append(element("span", "muted-text", "待补充"));
    return;
  }

  valid.slice(0, labeled ? 12 : 5).forEach(({ url, fallback }) => {
    const safe = safeUrl(url);
    const anchor = element("a", "link-button", labeled ? linkLabel(safe, fallback) : "↗");
    anchor.href = safe;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.title = `${linkLabel(safe, fallback)}：${safe}`;
    anchor.setAttribute("aria-label", `${lead.project_name} ${linkLabel(safe, fallback)}`);
    container.append(anchor);
  });

  if (!labeled && valid.length > 5) container.append(element("span", "more-links", `+${valid.length - 5}`));
}

function linksNode(lead, labeled = false) {
  const container = element("div", labeled ? "link-list link-list-labeled" : "link-list");
  appendLeadLinks(container, lead, labeled);
  return container;
}

function readOnlyStatus() {
  return element("span", "readonly-status", "🔒 公开只读");
}

function detailNode(lead) {
  const detail = element("div", "lead-detail");

  const linksSection = element("div", "detail-section");
  linksSection.append(element("span", "detail-label", "项目方入口"), linksNode(lead, true));

  const reasonSection = element("div", "detail-section");
  reasonSection.append(element("span", "detail-label", "判断依据"));
  reasonSection.append(element("p", "", lead.reason || "暂无判断依据"));
  const announcementUrl = safeUrl(lead.announcement_url);
  if (announcementUrl) {
    const announcement = element("a", "announcement-link", "查看 SafeTrade 原始公告 ↗");
    announcement.href = announcementUrl;
    announcement.target = "_blank";
    announcement.rel = "noreferrer";
    reasonSection.append(announcement);
  }

  const publicSection = element("div", "detail-section readonly-note");
  publicSection.append(element("span", "detail-label", "公开说明"));
  publicSection.append(element("p", "", "公开版本不显示内部处理状态和跟进备注。"));

  detail.append(linksSection, reasonSection, publicSection);
  return detail;
}

function cell(child, className = "") {
  const td = element("td", className);
  if (typeof child === "string") td.textContent = child;
  else td.append(child);
  return td;
}

function projectNode(lead, includeDate = false) {
  const project = element("div", "project-cell");
  project.append(element("strong", "", lead.project_name || "未知项目"));
  const suffix = includeDate ? ` · ${formatPublishedAt(lead.published_at).slice(0, 10)}` : "";
  project.append(element("span", "", `$${lead.symbol || "-"}${suffix}`));
  return project;
}

function toggleLead(id) {
  state.expandedId = state.expandedId === id ? null : id;
  renderLeads();
}

function filteredLeads() {
  const query = state.query.trim().toLowerCase();
  return state.leads.filter((lead) => {
    const haystack = [lead.project_name, lead.symbol, lead.title].map((value) => String(value || "").toLowerCase());
    return (
      (!query || haystack.some((value) => value.includes(query))) &&
      (state.priority === "全部" || lead.priority === state.priority) &&
      (state.listedType === "全部" || lead.listed_type === state.listedType)
    );
  });
}

function renderDesktop(leads) {
  const tbody = document.querySelector("#lead-table-body");
  const fragment = document.createDocumentFragment();

  leads.forEach((lead) => {
    const id = leadId(lead);
    const expanded = state.expandedId === id;
    const row = element("tr", expanded ? "lead-row expanded" : "lead-row");
    const typeLabel = element("span", "type-label", lead.listed_type === "relisted" ? "重新上线" : "新上线");
    const priority = element("span", `priority-badge priority-${lead.priority || "低"}`, lead.priority || "低");
    const toggle = element("button", "icon-button", expanded ? "▴" : "▾");
    toggle.type = "button";
    toggle.title = expanded ? "收起详情" : "展开详情";
    toggle.setAttribute("aria-label", `${expanded ? "收起" : "展开"} ${lead.project_name}`);
    toggle.addEventListener("click", () => toggleLead(id));

    row.append(
      cell(projectNode(lead)),
      cell(typeLabel),
      cell(formatPublishedAt(lead.published_at), "time-cell"),
      cell(linksNode(lead)),
      cell(priority),
      cell(readOnlyStatus()),
      cell(toggle),
    );
    fragment.append(row);

    if (expanded) {
      const detailRow = element("tr", "detail-row");
      const detailCell = cell(detailNode(lead));
      detailCell.colSpan = 7;
      detailRow.append(detailCell);
      fragment.append(detailRow);
    }
  });

  tbody.replaceChildren(fragment);
}

function renderMobile(leads) {
  const list = document.querySelector("#mobile-list");
  const fragment = document.createDocumentFragment();

  leads.forEach((lead) => {
    const id = leadId(lead);
    const expanded = state.expandedId === id;
    const article = element("article", "mobile-lead");
    const summary = element("button", "mobile-lead-summary");
    summary.type = "button";
    summary.append(
      projectNode(lead, true),
      element("span", `priority-badge priority-${lead.priority || "低"}`, lead.priority || "低"),
      element("span", "expand-symbol", expanded ? "▴" : "▾"),
    );
    summary.addEventListener("click", () => toggleLead(id));

    const meta = element("div", "mobile-meta");
    meta.append(linksNode(lead), readOnlyStatus());
    article.append(summary, meta);
    if (expanded) article.append(detailNode(lead));
    fragment.append(article);
  });

  list.replaceChildren(fragment);
}

function renderLeads() {
  const leads = filteredLeads();
  document.querySelector("#result-count").textContent = `当前显示 ${leads.length} 条，共 ${state.leads.length} 条`;
  renderDesktop(leads);
  renderMobile(leads);
  document.querySelector("#empty-state").classList.toggle("hidden", leads.length !== 0);
  document.querySelector(".table-wrap").classList.toggle("hidden", leads.length === 0);
  document.querySelector("#mobile-list").classList.toggle("hidden", leads.length === 0);
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatPublishedAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date
    .toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replaceAll("/", "-");
}

function showNotice(message, isError = false) {
  const notice = document.querySelector("#notice");
  notice.textContent = message;
  notice.className = isError ? "notice error-notice" : "notice";
}

async function loadLeads() {
  try {
    const response = await fetch(DATA_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) throw new Error("items 不是列表");

    state.leads = payload.items;
    state.expandedId = state.leads[0] ? leadId(state.leads[0]) : null;
    const highPriority = state.leads.filter((lead) => lead.priority === "高").length;
    const withContacts = state.leads.filter((lead) => Array.isArray(lead.contact_links) && lead.contact_links.length > 0).length;
    document.querySelector("#stat-total").textContent = String(state.leads.length);
    document.querySelector("#stat-high").textContent = String(highPriority);
    document.querySelector("#stat-contacts").textContent = String(withContacts);
    document.querySelector("#sync-state").textContent = `最近同步：${formatSyncTime(payload.generated_at)}`;
    renderLeads();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showNotice(`遇到错误：读取公开数据失败，返回内容：${detail}`, true);
    document.querySelector("#result-count").textContent = "公开数据暂时无法读取";
  }
}

document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderLeads();
});

document.querySelector("#type-filter").addEventListener("change", (event) => {
  state.listedType = event.target.value;
  renderLeads();
});

document.querySelectorAll("[data-priority]").forEach((button) => {
  button.addEventListener("click", () => {
    state.priority = button.dataset.priority;
    document.querySelectorAll("[data-priority]").forEach((item) => item.classList.toggle("active", item === button));
    renderLeads();
  });
});

document.querySelector("#copy-endpoint").addEventListener("click", async () => {
  const endpoint = new URL(DATA_PATH, window.location.href).href;
  try {
    await navigator.clipboard.writeText(endpoint);
    showNotice("AI 接口地址已复制");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showNotice(`遇到错误：复制失败，返回内容：${detail}`, true);
  }
});

loadLeads();
