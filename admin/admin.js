```javascript
    const selected = data.users.find(entry => entry.id === user.id);

    if (!selected) {
      throw new Error("Benutzer konnte nicht geladen werden.");
    }

    const permissionsData = await apiRequest(
      `${API_ADMIN}/users/${encodeURIComponent(user.id)}/permissions`,
      { method: "GET" }
    ).catch(() => null);

    const currentPermissions = permissionsData?.permissions || [];

    document.getElementById("permissionUser").textContent =
      `Berechtigungen für ${user.name} (${user.email})`;

    renderPermissionGroups(currentPermissions);
    permissionPanel.hidden = false;
    permissionPanel.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    showMessage(
      dashboardMessage,
      "Die Berechtigungen konnten noch nicht geladen werden. Die Lese-Funktion wird im nächsten API-Schritt ergänzt.",
      "error"
    );
  }
}

permissionsForm?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!selectedUserId) return;

  const permissions = Array.from(
    permissionsForm.querySelectorAll('input[name="permissions"]:checked')
  ).map(input => input.value);

  try {
    await apiRequest(
      `${API_ADMIN}/users/${encodeURIComponent(selectedUserId)}/permissions`,
      {
        method: "POST",
        body: JSON.stringify({ permissions })
      }
    );

    showMessage(dashboardMessage, "Berechtigungen wurden gespeichert.", "success");
    permissionPanel.hidden = true;
    selectedUserId = null;
  } catch (error) {
    showMessage(dashboardMessage, getErrorMessage(error), "error");
  }
});

document.getElementById("cancelPermissions")?.addEventListener("click", () => {
  permissionPanel.hidden = true;
  selectedUserId = null;
});

// --------------------------------------------------
// ABMELDEN
// --------------------------------------------------

document.getElementById("logoutButton")?.addEventListener("click", async () => {
  try {
    await apiRequest(`${API_AUTH}/sign-out`, {
      method: "POST",
      body: "{}"
    });
  } finally {
    window.location.href = "/admin/login.html";
  }
});

// Start

// =========================================
// ULTOR CMS – NAVIGATION
// =========================================

const VIEW_TITLES = {
  dashboard: "Dashboard",
  news: "News",
  teams: "Teams & Spieler",
  partners: "Partner",
  media: "Medien",
  users: "Benutzer & Rechte",
  activity: "Aktivitätsprotokoll"
};

function openCmsView(viewName) {
  const target = document.getElementById(`view-${viewName}`);

  if (!target) return;

  document.querySelectorAll(".cms-view").forEach(view => {
    view.classList.remove("active");
  });

  target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  const breadcrumb = document.getElementById("breadcrumbTitle");

  if (breadcrumb) {
    breadcrumb.textContent = VIEW_TITLES[viewName] || "Dashboard";
  }

  document.getElementById("sidebar")?.classList.remove("open");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    openCmsView(button.dataset.view);
  });
});

// Mobile Navigation
document.getElementById("mobileMenuButton")?.addEventListener("click", () => {
  document.getElementById("sidebar")?.classList.toggle("open");
});

// Benutzerinformationen im neuen Dashboard anzeigen
const originalLoadDashboard = loadDashboard;

loadDashboard = async function () {
  await originalLoadDashboard();

  const userLabel = document.getElementById("currentUser");

  if (!userLabel) return;

  try {
    const data = await apiRequest(`${API_ADMIN}/me`);
    const user = data.user;
    const isOwner = user.is_owner === 1;

    const sidebarName = document.getElementById("sidebarUserName");
    const sidebarRole = document.getElementById("sidebarUserRole");
    const avatar = document.getElementById("userAvatar");

    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarRole) sidebarRole.textContent = isOwner ? "Owner" : "CMS-Benutzer";
    if (avatar) avatar.textContent = (user.name || "U").charAt(0).toUpperCase();

    const roleText = isOwner ? "OWNER" : "BENUTZER";
    const statRole = document.getElementById("statUserRole");
    const statPermissions = document.getElementById("statPermissionCount");

    if (statRole) statRole.textContent = roleText;
    if (statPermissions) {
      statPermissions.textContent = isOwner
        ? "Alle"
        : String(data.permissions.length);
    }

    const accountName = document.getElementById("accountName");
    const accountEmail = document.getElementById("accountEmail");
    const accountRole = document.getElementById("accountRole");

    if (accountName) accountName.textContent = user.name;
    if (accountEmail) accountEmail.textContent = user.email;
    if (accountRole) accountRole.textContent = roleText;

  } catch (error) {
    console.error("Dashboard profile error:", error);
  }
};

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
// ULTOR CMS – NEWS MANAGEMENT (FORTSETZUNG)
// =========================================

document.getElementById("refreshNewsButton")?.addEventListener("click", loadNews);

async function runNewsAction(id, action) {
  const labels = {
    submit: "Diesen Beitrag zur Freigabe einreichen?",
    publish: "Diesen Beitrag veröffentlichen?",
    archive: "Diesen Beitrag archivieren?",
    unpublish: "Diesen Beitrag zurückziehen?"
  };

  if (!window.confirm(labels[action] || "Aktion ausführen?")) return;

  try {
    const data = await apiRequest(
      `/api/admin/news/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    showMessage(newsMessage, data.message || "Aktion erfolgreich.", "success");
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

    showMessage(newsMessage, data.message || "Beitrag gelöscht.", "success");
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  }
}

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

document.querySelectorAll(".editor-toolbar [data-command]").forEach(button => {
  button.addEventListener("mousedown", event => event.preventDefault());

  button.addEventListener("click", () => {
    if (!newsRichEditor) return;

    newsRichEditor.focus();

    document.execCommand(
      button.dataset.command,
      false,
      button.dataset.value || null
    );

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

    newsImageKey.value = data.key;
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
          // Auch den Inhalt nicht erlaubter Elemente bereinigen, bevor wir
          // den äußeren Container entfernen.
          cleanNode(child);
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }

        const tag = child.tagName;
        const rawHref = tag === "A" ? child.getAttribute("href") : null;

        // Alle Attribute entfernen; Links erhalten nur eine geprüfte Zieladresse.
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
            // Ungültige Linkziele werden als normaler Text dargestellt.
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

document.querySelectorAll(".editor-toolbar [data-command]").forEach(button => {
  // Verhindert, dass der Klick auf die Toolbar die Textauswahl im Editor verliert.
  button.addEventListener("mousedown", event => event.preventDefault());

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
  if (newsUploadStatus) newsUploadStatus.textContent = "Bild wird hochgeladen …";

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

    if (newsUploadStatus) newsUploadStatus.textContent = "Upload erfolgreich.";
    showMessage(newsMessage, "Bild wurde erfolgreich hochgeladen.", "success");

  } catch (error) {
    if (newsUploadStatus) newsUploadStatus.textContent = "Upload fehlgeschlagen.";
    showMessage(newsMessage, getErrorMessage(error), "error");

  } finally {
    uploadNewsImage.disabled = false;
  }
});

removeNewsImage?.addEventListener("click", () => {
  newsImageKey.value = "";
  if (newsImageFile) newsImageFile.value = "";

  showNewsImagePreview(null);
  if (newsUploadStatus) newsUploadStatus.textContent = "Kein Bild ausgewählt.";
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

loadDashboard();
