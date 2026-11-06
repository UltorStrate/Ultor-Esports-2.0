const API_AUTH = "/api/auth";
const API_ADMIN = "/api/admin";

const PERMISSION_GROUPS = {
  "News": [
    ["news.view", "News ansehen"],
    ["news.create", "News erstellen"],
    ["news.edit", "News bearbeiten"],
    ["news.delete", "News löschen"],
    ["news.publish", "News veröffentlichen"]
  ],
  "Teams": [
    ["teams.view", "Teams ansehen"],
    ["teams.create", "Teams erstellen"],
    ["teams.edit", "Teams bearbeiten"],
    ["teams.delete", "Teams löschen"],
    ["teams.publish", "Teams veröffentlichen"]
  ],
  "Partner": [
    ["partners.view", "Partner ansehen"],
    ["partners.create", "Partner erstellen"],
    ["partners.edit", "Partner bearbeiten"],
    ["partners.delete", "Partner löschen"],
    ["partners.publish", "Partner veröffentlichen"]
  ],
  "Medien": [
    ["media.view", "Medien ansehen"],
    ["media.upload", "Medien hochladen"],
    ["media.delete", "Medien löschen"]
  ],
  "Benutzer": [
    ["users.view", "Benutzer ansehen"],
    ["users.create", "Benutzer erstellen"],
    ["users.edit", "Benutzer bearbeiten"],
    ["users.delete", "Benutzer löschen"]
  ],
  "System": [
    ["settings.manage", "Einstellungen verwalten"],
    ["audit.view", "Aktivitätsprotokoll ansehen"]
  ]
};

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Fehler ${response.status}`);
  }

  return data;
}

function showMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.";
}

// --------------------------------------------------
// LOGIN UND REGISTRIERUNG
// --------------------------------------------------

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authMessage = document.getElementById("authMessage");

function showAuthTab(tab) {
  if (!loginForm || !registerForm) return;

  const showLogin = tab === "login";

  loginForm.hidden = !showLogin;
  registerForm.hidden = showLogin;

  loginTab?.classList.toggle("active", showLogin);
  registerTab?.classList.toggle("active", !showLogin);

  showMessage(authMessage, "");
}

loginTab?.addEventListener("click", () => showAuthTab("login"));
registerTab?.addEventListener("click", () => showAuthTab("register"));

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(authMessage, "Anmeldung läuft …");

  try {
    const data = await apiRequest(`${API_AUTH}/sign-in/email`, {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });

    if (!data.user) {
      throw new Error("Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.");
    }

    window.location.href = "/admin/index.html";
  } catch (error) {
    showMessage(authMessage, getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
});

registerForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = registerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(authMessage, "Konto wird erstellt …");

  try {
    await apiRequest(`${API_AUTH}/sign-up/email`, {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("registerName").value.trim(),
        email: document.getElementById("registerEmail").value.trim(),
        password: document.getElementById("registerPassword").value
      })
    });

    registerForm.reset();

    showMessage(
      authMessage,
      "Dein Konto wurde erstellt. Es muss jetzt noch vom Owner freigegeben werden. Du kannst dich anschließend anmelden.",
      "success"
    );
  } catch (error) {
    showMessage(authMessage, getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
});

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

const dashboardMessage = document.getElementById("dashboardMessage");
const ownerPanel = document.getElementById("ownerPanel");
const standardPanel = document.getElementById("standardPanel");
const usersList = document.getElementById("usersList");
const userStatusFilter = document.getElementById("userStatusFilter");
const permissionPanel = document.getElementById("permissionPanel");
const permissionGroups = document.getElementById("permissionGroups");
const permissionsForm = document.getElementById("permissionsForm");

let selectedUserId = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

async function loadDashboard() {
  if (!document.getElementById("currentUser")) return;

  try {
    const data = await apiRequest(`${API_ADMIN}/me`);

    document.getElementById("currentUser").textContent =
      `${data.user.name} (${data.user.email})`;

    const isOwner = data.user.is_owner === 1;

    document.getElementById("roleBadge").textContent =
      isOwner ? "OWNER" : "CMS-BENUTZER";

    ownerPanel.hidden = !isOwner;
    standardPanel.hidden = isOwner;

    if (isOwner) {
      await loadUsers();
    } else {
      renderMyPermissions(data.permissions);
    }
  } catch (error) {
    showMessage(dashboardMessage, getErrorMessage(error), "error");

    if (error.message.includes("Nicht angemeldet") ||
        error.message.includes("freigegeben")) {
      window.location.href = "/admin/login.html";
    }
  }
}

function renderMyPermissions(permissions) {
  const container = document.getElementById("myPermissions");
  if (!container) return;

  container.replaceChildren();

  if (!permissions.length) {
    container.append(
      createElement("p", "muted", "Deinem Konto wurden noch keine Berechtigungen zugewiesen.")
    );
    return;
  }

  for (const permission of permissions) {
    container.append(createElement("span", "permission-chip", permission));
  }
    const API_AUTH = "/api/auth";
const API_ADMIN = "/api/admin";

const PERMISSION_GROUPS = {
  "News": [
    ["news.view", "News ansehen"],
    ["news.create", "News erstellen"],
    ["news.edit", "News bearbeiten"],
    ["news.delete", "News löschen"],
    ["news.publish", "News veröffentlichen"]
  ],
  "Teams": [
    ["teams.view", "Teams ansehen"],
    ["teams.create", "Teams erstellen"],
    ["teams.edit", "Teams bearbeiten"],
    ["teams.delete", "Teams löschen"],
    ["teams.publish", "Teams veröffentlichen"]
  ],
  "Partner": [
    ["partners.view", "Partner ansehen"],
    ["partners.create", "Partner erstellen"],
    ["partners.edit", "Partner bearbeiten"],
    ["partners.delete", "Partner löschen"],
    ["partners.publish", "Partner veröffentlichen"]
  ],
  "Medien": [
    ["media.view", "Medien ansehen"],
    ["media.upload", "Medien hochladen"],
    ["media.delete", "Medien löschen"]
  ],
  "Benutzer": [
    ["users.view", "Benutzer ansehen"],
    ["users.create", "Benutzer erstellen"],
    ["users.edit", "Benutzer bearbeiten"],
    ["users.delete", "Benutzer löschen"]
  ],
  "System": [
    ["settings.manage", "Einstellungen verwalten"],
    ["audit.view", "Aktivitätsprotokoll ansehen"]
  ]
};

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Fehler ${response.status}`);
  }

  return data;
}

function showMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.";
}

// --------------------------------------------------
// LOGIN UND REGISTRIERUNG
// --------------------------------------------------

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authMessage = document.getElementById("authMessage");

function showAuthTab(tab) {
  if (!loginForm || !registerForm) return;

  const showLogin = tab === "login";

  loginForm.hidden = !showLogin;
  registerForm.hidden = showLogin;

  loginTab?.classList.toggle("active", showLogin);
  registerTab?.classList.toggle("active", !showLogin);

  showMessage(authMessage, "");
}

loginTab?.addEventListener("click", () => showAuthTab("login"));
registerTab?.addEventListener("click", () => showAuthTab("register"));

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(authMessage, "Anmeldung läuft …");

  try {
    const data = await apiRequest(`${API_AUTH}/sign-in/email`, {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });

    if (!data.user) {
      throw new Error("Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.");
    }

    window.location.href = "/admin/index.html";
  } catch (error) {
    showMessage(authMessage, getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
});

registerForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = registerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(authMessage, "Konto wird erstellt …");

  try {
    await apiRequest(`${API_AUTH}/sign-up/email`, {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("registerName").value.trim(),
        email: document.getElementById("registerEmail").value.trim(),
        password: document.getElementById("registerPassword").value
      })
    });

    registerForm.reset();

    showMessage(
      authMessage,
      "Dein Konto wurde erstellt. Es muss jetzt noch vom Owner freigegeben werden. Du kannst dich anschließend anmelden.",
      "success"
    );
  } catch (error) {
    showMessage(authMessage, getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
});

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

const dashboardMessage = document.getElementById("dashboardMessage");
const ownerPanel = document.getElementById("ownerPanel");
const standardPanel = document.getElementById("standardPanel");
const usersList = document.getElementById("usersList");
const userStatusFilter = document.getElementById("userStatusFilter");
const permissionPanel = document.getElementById("permissionPanel");
const permissionGroups = document.getElementById("permissionGroups");
const permissionsForm = document.getElementById("permissionsForm");

let selectedUserId = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

async function loadDashboard() {
  if (!document.getElementById("currentUser")) return;

  try {
    const data = await apiRequest(`${API_ADMIN}/me`);

    document.getElementById("currentUser").textContent =
      `${data.user.name} (${data.user.email})`;

    const isOwner = data.user.is_owner === 1;

    document.getElementById("roleBadge").textContent =
      isOwner ? "OWNER" : "CMS-BENUTZER";

    ownerPanel.hidden = !isOwner;
    standardPanel.hidden = isOwner;

    if (isOwner) {
      await loadUsers();
    } else {
      renderMyPermissions(data.permissions);
    }
  } catch (error) {
    showMessage(dashboardMessage, getErrorMessage(error), "error");

    if (error.message.includes("Nicht angemeldet") ||
        error.message.includes("freigegeben")) {
      window.location.href = "/admin/login.html";
    }
  }
}

function renderMyPermissions(permissions) {
  const container = document.getElementById("myPermissions");
  if (!container) return;

  container.replaceChildren();

  if (!permissions.length) {
    container.append(
      createElement("p", "muted", "Deinem Konto wurden noch keine Berechtigungen zugewiesen.")
    );
    return;
  }

  for (const permission of permissions) {
    container.append(createElement("span", "permission-chip", permission));
  }
}
// =========================================
// ULTOR CMS – NEWS MANAGEMENT
// =========================================

let newsItems = [];
let newsPermissions = [];
let editingNewsId = null;

const newsList = document.getElementById("newsList");
const newsEditor = document.getElementById("newsEditor");
const newsForm = document.getElementById("newsForm");
const newsMessage = document.getElementById("newsMessage");

function newsCan(permission) {
  return newsPermissions.includes("*") ||
    newsPermissions.includes(permission);
}

function newsButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function newsStatusLabel(status) {
  return {
    draft: "Entwurf",
    pending: "Ausstehend",
    published: "Veröffentlicht",
    archived: "Archiviert"
  }[status] || status;
}

function newsDate(value) {
  if (!value) return "–";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

async function loadNews() {
  if (!newsList) return;

  newsList.replaceChildren(
    createElement("p", "muted", "Beiträge werden geladen …")
  );

  try {
    const filter = document.getElementById("newsStatusFilter")?.value || "";
    const query = filter ? `?status=${encodeURIComponent(filter)}` : "";

    const data = await apiRequest(`/api/admin/news${query}`);
    newsItems = data.news || [];

    newsList.replaceChildren();

    if (!newsItems.length) {
      newsList.append(
        createElement("p", "muted", "Noch keine Beiträge vorhanden.")
      );
      return;
    }

    for (const item of newsItems) {
      const card = createElement("article", "news-card");
      const details = createElement("div", "news-card-details");
      const title = createElement("h3", "", item.title);
      const meta = createElement(
        "p",
        "news-meta",
        `${newsStatusLabel(item.status)} · ${item.author_name || "Unbekannt"} · ${newsDate(item.updated_at)}`
      );

      details.append(title, meta);

      if (item.excerpt) {
        details.append(createElement("p", "news-excerpt", item.excerpt));
      }

      const actions = createElement("div", "news-actions");

      if (
        newsCan("news.edit") &&
        (item.status === "draft" || item.status === "pending")
      ) {
        actions.append(
          newsButton("Bearbeiten", "secondary-button", () => editNews(item.id))
        );
      }

      if (newsCan("news.edit") && item.status === "draft") {
        actions.append(
          newsButton("Einreichen", "secondary-button", () =>
            runNewsAction(item.id, "submit")
          )
        );
      }

      if (
        newsCan("news.publish") &&
        (item.status === "pending" || item.status === "draft")
      ) {
        actions.append(
          newsButton("Veröffentlichen", "primary-button", () =>
            runNewsAction(item.id, "publish")
          )
        );
      }

      if (newsCan("news.publish") && item.status === "published") {
        actions.append(
          newsButton("Zurückziehen", "secondary-button", () =>
            runNewsAction(item.id, "unpublish")
          ),
          newsButton("Archivieren", "secondary-button", () =>
            runNewsAction(item.id, "archive")
          )
        );
      }

      if (newsCan("news.delete")) {
        actions.append(
          newsButton("Löschen", "danger-button", () => deleteNews(item.id))
        );
      }

      card.append(details, actions);
      newsList.append(card);
    }
  } catch (error) {
    newsList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

function openNewsEditor(item = null) {
  editingNewsId = item?.id || null;

  document.getElementById("newsEditorTitle").textContent =
    item ? "Beitrag bearbeiten" : "Neuen Beitrag erstellen";

  document.getElementById("newsId").value = item?.id || "";
  document.getElementById("newsTitle").value = item?.title || "";
  document.getElementById("newsExcerpt").value = item?.excerpt || "";

  const editor = document.getElementById("newsContent");
  if (editor) {
    editor.innerHTML = sanitizeNewsHTML(item?.content || "");
  }

  document.getElementById("newsImageKey").value = item?.image_key || "";

  updateNewsPreview();

  newsEditor.hidden = false;
  newsEditor.scrollIntoView({ behavior: "smooth" });
}

function closeNewsEditor() {
  newsEditor.hidden = true;
  newsForm.reset();

  const editor = document.getElementById("newsContent");
  if (editor) editor.innerHTML = "";

  const preview = document.getElementById("newsPreview");
  if (preview) preview.hidden = true;

  const previewButton = document.getElementById("toggleNewsPreview");
  if (previewButton) previewButton.textContent = "Vorschau anzeigen";

  editingNewsId = null;
}

async function editNews(id) {
  try {
    const data = await apiRequest(`/api/admin/news/${encodeURIComponent(id)}`);
    openNewsEditor(data.news);
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  }
}

document.getElementById("createNewsButton")?.addEventListener("click", () => {
  if (!newsCan("news.create")) {
    showMessage(newsMessage, "Du hast keine Berechtigung, News zu erstellen.", "error");
    return;
  }

  openNewsEditor();
});

document.getElementById("closeNewsEditor")?.addEventListener("click", closeNewsEditor);
document.getElementById("cancelNewsEditor")?.addEventListener("click", closeNewsEditor);

document.getElementById("newsStatusFilter")?.addEventListener("change", loadNews);

newsForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = newsForm.querySelector('button[type="submit"]');
  button.disabled = true;

  const editor = document.getElementById("newsContent");
  const safeContent = sanitizeNewsHTML(editor?.innerHTML || "");
  const plainContent = editor?.textContent?.trim() || "";

  if (!plainContent) {
    showMessage(newsMessage, "Bitte gib einen Artikelinhalt ein.", "error");
    button.disabled = false;
    editor?.focus();
    return;
  }

  const body = {
    title: document.getElementById("newsTitle").value.trim(),
    excerpt: document.getElementById("newsExcerpt").value.trim(),
    content: safeContent,
    image_key: document.getElementById("newsImageKey").value.trim() || null
  };

  try {
    if (editingNewsId) {
      await apiRequest(`/api/admin/news/${encodeURIComponent(editingNewsId)}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      showMessage(newsMessage, "Beitrag wurde aktualisiert.", "success");
    } else {
      await apiRequest("/api/admin/news", {
        method: "POST",
        body: JSON.stringify(body)
      });
      showMessage(newsMessage, "Neuer Entwurf wurde gespeichert.", "success");
    }

    closeNewsEditor();
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
});
 // =========================================
// ULTOR CMS – RICH TEXT EDITOR & PREVIEW
// =========================================

function sanitizeNewsHTML(html) {
  const parser = new DOMParser();
  const documentCopy = parser.parseFromString(String(html || ""), "text/html");
  const allowedTags = new Set([
    "P", "BR", "H2", "H3", "STRONG", "B", "EM", "I", "U",
    "UL", "OL", "LI", "BLOCKQUOTE", "A"
  ]);

  function cleanNode(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.has(child.tagName)) {
          cleanNode(child);
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }

        const tag = child.tagName;
        const rawHref = tag === "A" ? child.getAttribute("href") : null;

        for (const attribute of Array.from(child.attributes)) {
          child.removeAttribute(attribute.name);
        }

        if (tag === "A" && rawHref) {
          try {
            const parsed = new URL(rawHref, window.location.origin);
            if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
              child.setAttribute("href", rawHref);
              child.setAttribute("target", "_blank");
              child.setAttribute("rel", "noopener noreferrer");
            }
          } catch {
            // Ungültige Linkziele werden nicht übernommen.
          }
        }

        cleanNode(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    }
  }

  cleanNode(documentCopy.body);
  return documentCopy.body.innerHTML;
}

function updateNewsPreview() {
  const editor = document.getElementById("newsContent");
  const previewContent = document.getElementById("newsPreviewContent");
  if (!editor || !previewContent) return;

  previewContent.innerHTML = sanitizeNewsHTML(editor.innerHTML);
}

const newsRichEditor = document.getElementById("newsContent");
const newsPreviewPanel = document.getElementById("newsPreview");
const newsPreviewToggle = document.getElementById("toggleNewsPreview");

document.addEventListener("click", event => {
  const button = event.target.closest("[data-view]");

  if (!button) return;

  event.preventDefault();

  const viewName = button.dataset.view;

  if (viewName) {
    openCmsView(viewName);
  }
});
  button.addEventListener("click", () => {
    if (!newsRichEditor) return;

    newsRichEditor.focus();

    const command = button.dataset.command;
    const value = button.dataset.value || null;

    document.execCommand(command, false, value);
    updateNewsPreview();
  });
});

document.getElementById("newsLinkButton")?.addEventListener("mousedown", event => {
  event.preventDefault();
});

document.getElementById("newsLinkButton")?.addEventListener("click", () => {
  if (!newsRichEditor) return;

  newsRichEditor.focus();
  const url = window.prompt("Link-Adresse eingeben (https://… oder mailto:…):");
  if (!url) return;

  let parsed;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    showMessage(newsMessage, "Bitte gib eine gültige Link-Adresse ein.", "error");
    return;
  }

  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
    showMessage(newsMessage, "Dieser Link-Typ ist nicht erlaubt.", "error");
    return;
  }

  document.execCommand("createLink", false, url);
  updateNewsPreview();
});

newsRichEditor?.addEventListener("input", updateNewsPreview);

newsPreviewToggle?.addEventListener("click", () => {
  if (!newsPreviewPanel) return;

  const willShow = newsPreviewPanel.hidden;
  updateNewsPreview();
  newsPreviewPanel.hidden = !willShow;
  newsPreviewToggle.textContent = willShow
    ? "Vorschau ausblenden"
    : "Vorschau anzeigen";
});

// =========================================
// ULTOR CMS – NEWS-AKTIONEN
// =========================================

async function runNewsAction(id, action) {
  const labels = {
    submit: "Diesen Beitrag zur Freigabe einreichen?",
    publish: "Diesen Beitrag veröffentlichen?",
    archive: "Diesen Beitrag archivieren?",
    unpublish: "Diesen Beitrag zurückziehen?"
  };

  if (!window.confirm(labels[action])) return;

  try {
    const data = await apiRequest(
      `/api/admin/news/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        body: "{}"
      }
    );

    showMessage(newsMessage, data.message, "success");
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  }
}

async function deleteNews(id) {
  if (!window.confirm("Möchtest du diesen Beitrag endgültig löschen?")) return;

  try {
    const data = await apiRequest(
      `/api/admin/news/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    showMessage(newsMessage, data.message, "success");
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  }
}

// News beim Öffnen des Bereichs laden
const previousOpenCmsView = openCmsView;

openCmsView = function(viewName) {
  previousOpenCmsView(viewName);

  if (viewName === "news") {
    apiRequest("/api/admin/me")
      .then(data => {
        newsPermissions = data.permissions || [];

        const createButton = document.getElementById("createNewsButton");
        if (createButton) {
          createButton.hidden = !newsCan("news.create");
        }

        loadNews();
      })
      .catch(error => {
        showMessage(newsMessage, getErrorMessage(error), "error");
      });
  }
};

// =========================================
// ULTOR CMS – NEWS IMAGE UPLOAD
// =========================================

const newsImageFile = document.getElementById("newsImageFile");
const uploadNewsImage = document.getElementById("uploadNewsImage");
const newsUploadStatus = document.getElementById("newsUploadStatus");
const newsImageKey = document.getElementById("newsImageKey");
const newsImagePreview = document.getElementById("newsImagePreview");
const newsPreviewImg = document.getElementById("newsPreviewImg");
const removeNewsImage = document.getElementById("removeNewsImage");

function showNewsImagePreview(key) {
  if (!newsImagePreview || !newsPreviewImg) return;

  if (!key) {
    newsImagePreview.hidden = true;
    newsPreviewImg.removeAttribute("src");
    return;
  }

  newsPreviewImg.src = `/media/${key}`;
  newsImagePreview.hidden = false;
}

uploadNewsImage?.addEventListener("click", async () => {
  const file = newsImageFile?.files?.[0];

  if (!file) {
    showMessage(newsMessage, "Bitte wähle zuerst ein Bild aus.", "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    showMessage(newsMessage, "Das Bild darf maximal 8 MB groß sein.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  uploadNewsImage.disabled = true;

  if (newsUploadStatus) {
    newsUploadStatus.textContent = "Bild wird hochgeladen …";
  }

  try {
    const response = await fetch("/api/admin/media/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Upload fehlgeschlagen (${response.status})`);
    }

    if (newsImageKey) newsImageKey.value = data.key;
    showNewsImagePreview(data.key);

    if (newsUploadStatus) {
      newsUploadStatus.textContent = "Upload erfolgreich.";
    }

    showMessage(newsMessage, "Bild wurde erfolgreich hochgeladen.", "success");

  } catch (error) {
    if (newsUploadStatus) {
      newsUploadStatus.textContent = "Upload fehlgeschlagen.";
    }

    showMessage(newsMessage, getErrorMessage(error), "error");

  } finally {
    uploadNewsImage.disabled = false;
  }
});

removeNewsImage?.addEventListener("click", () => {
  if (newsImageKey) newsImageKey.value = "";
  if (newsImageFile) newsImageFile.value = "";

  showNewsImagePreview(null);

  if (newsUploadStatus) {
    newsUploadStatus.textContent = "Kein Bild ausgewählt.";
  }
});

newsImageKey?.addEventListener("change", () => {
  showNewsImagePreview(newsImageKey.value.trim());
});

// Vorschau beim Öffnen eines bestehenden Beitrags
const originalOpenNewsEditor = openNewsEditor;

openNewsEditor = function(item = null) {
  originalOpenNewsEditor(item);

  if (newsImageFile) newsImageFile.value = "";

  showNewsImagePreview(item?.image_key || "");

  if (newsUploadStatus) {
    newsUploadStatus.textContent = item?.image_key
      ? "Gespeichertes Beitragsbild"
      : "JPG, PNG, WEBP oder GIF · maximal 8 MB";
  }
};

// =========================================
// START
// =========================================
// =========================================
// ULTOR CMS – INITIALISIERUNG
// =========================================

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
});

loadDashboard();   
}
