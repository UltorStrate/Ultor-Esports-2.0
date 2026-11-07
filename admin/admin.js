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
  "Shop": [
    ["shop.view", "Shop ansehen"],
    ["shop.categories.manage", "Kategorien verwalten"],
    ["shop.products.create", "Produkte erstellen"],
    ["shop.products.edit", "Produkte bearbeiten"],
    ["shop.products.delete", "Produkte löschen"],
    ["shop.products.publish", "Produkte veröffentlichen"]
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
  const headers = new Headers(options.headers || {});
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers
  });

  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }
  if (!response.ok) {
    const message = data.message || data.error?.message || data.error || `Fehler ${response.status}`;
    throw new Error(typeof message === "string" ? message : `Fehler ${response.status}`);
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

// Owner-Benutzer besitzen automatisch alle CMS-Berechtigungen.
function permissionsForResponse(data) {
  const user = data?.user || data?.currentUser || {};
  const owner = user.is_owner === 1 || user.is_owner === true ||
    user.is_owner === "1" || user.is_owner === "true";
  window.ULTOR_IS_OWNER = owner;
  return owner ? ["*"] : (Array.isArray(data?.permissions) ? data.permissions : []);
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
    await apiRequest(`${API_AUTH}/sign-in/email`, {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });

    await apiRequest(`${API_ADMIN}/me`);
    window.location.replace("/admin/index.html");
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

// --------------------------------------------------
// BENUTZERVERWALTUNG
// --------------------------------------------------

async function loadUsers() {
  if (!usersList || !userStatusFilter) return;

  usersList.replaceChildren(
    createElement("p", "muted", "Benutzer werden geladen …")
  );

  try {
    const status = userStatusFilter.value;
    const data = await apiRequest(
      `${API_ADMIN}/users?status=${encodeURIComponent(status)}`
    );

    usersList.replaceChildren();

    if (!data.users.length) {
      usersList.append(
        createElement("p", "muted", "Keine Benutzer in dieser Kategorie.")
      );
      return;
    }

    for (const user of data.users) {
      const card = createElement("article", "user-card");
      const details = createElement("div");
      const name = createElement("h3", "", user.name);
      const email = createElement("p", "", user.email);
      const meta = createElement(
        "p",
        "",
        `Status: ${user.status} · Erstellt: ${user.created_at}`
      );

      details.append(name, email, meta);

      const actions = createElement("div", "user-actions");

      if (user.status === "pending") {
        actions.append(
          makeActionButton("Freigeben", "primary-button", () =>
            changeUserStatus(user.id, "approve")
          ),
          makeActionButton("Ablehnen", "danger-button", () =>
            changeUserStatus(user.id, "reject")
          )
        );
      }

      if (user.status === "approved") {
        actions.append(
          makeActionButton("Rechte verwalten", "secondary-button", () =>
            openPermissions(user)
          ),
          makeActionButton("Sperren", "danger-button", () =>
            changeUserStatus(user.id, "suspend")
          )
        );
      }

      if (user.status === "suspended" || user.status === "rejected") {
        actions.append(
          makeActionButton("Freigeben", "primary-button", () =>
            changeUserStatus(user.id, "approve")
          )
        );
      }

      card.append(details, actions);
      usersList.append(card);
    }
  } catch (error) {
    usersList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

function makeActionButton(label, className, callback) {
  const button = createElement("button", className, label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}

async function changeUserStatus(userId, action) {
  const confirmation = {
    approve: "Möchtest du diesen Benutzer freigeben?",
    reject: "Möchtest du diesen Benutzer ablehnen?",
    suspend: "Möchtest du diesen Benutzer sperren?"
  };

  if (!window.confirm(confirmation[action])) return;

  try {
    const data = await apiRequest(
      `${API_ADMIN}/users/${encodeURIComponent(userId)}/${action}`,
      { method: "POST", body: "{}" }
    );

    showMessage(dashboardMessage, data.message, "success");
    await loadUsers();
  } catch (error) {
    showMessage(dashboardMessage, getErrorMessage(error), "error");
  }
}

userStatusFilter?.addEventListener("change", loadUsers);

// --------------------------------------------------
// BERECHTIGUNGEN
// --------------------------------------------------

function renderPermissionGroups(selectedPermissions = []) {
  permissionGroups.replaceChildren();

  for (const [groupName, permissions] of Object.entries(PERMISSION_GROUPS)) {
    const group = createElement("section", "permission-group");
    group.append(createElement("h3", "", groupName));

    for (const [permission, label] of permissions) {
      const wrapper = createElement("label", "permission-option");
      const checkbox = document.createElement("input");

      checkbox.type = "checkbox";
      checkbox.name = "permissions";
      checkbox.value = permission;
      checkbox.checked = selectedPermissions.includes(permission);

      wrapper.append(checkbox, document.createTextNode(label));
      group.append(wrapper);
    }

    permissionGroups.append(group);
  }
}

async function openPermissions(user) {
  selectedUserId = user.id;

  try {
    const data = await apiRequest(
      `${API_ADMIN}/users?status=approved`
    );

    const selected = data.users.find(entry => entry.id === user.id);

    if (!selected) {
      throw new Error("Benutzer konnte nicht geladen werden.");
    }

    const permissionsData = await apiRequest(
      `${API_ADMIN}/users/${encodeURIComponent(user.id)}/permissions`,
      { method: "GET" }
    );

    if (!Array.isArray(permissionsData.permissions)) {
      throw new Error("Die API hat keine gültige Berechtigungsliste zurückgegeben.");
    }

    const currentPermissions = permissionsData.permissions;

    document.getElementById("permissionUser").textContent =
      `Berechtigungen für ${user.name} (${user.email})`;

    renderPermissionGroups(currentPermissions);
    permissionPanel.hidden = false;
    permissionPanel.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    selectedUserId = null;
    showMessage(
      dashboardMessage,
      `Berechtigungen konnten nicht geladen werden: ${getErrorMessage(error)}`,
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
  shop: "Shop",
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

// Dashboard-Profil und Kennzahlen werden zentral am Dateiende geladen.

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
  return window.ULTOR_IS_OWNER === true ||
    newsPermissions.includes("*") || newsPermissions.includes(permission);
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
  document.getElementById("newsContent").value = item?.content || "";
  document.getElementById("newsImageKey").value = item?.image_key || "";

  newsEditor.hidden = false;
  newsEditor.scrollIntoView({ behavior: "smooth" });
}

function closeNewsEditor() {
  newsEditor.hidden = true;
  newsForm.reset();
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

  const body = {
    title: document.getElementById("newsTitle").value.trim(),
    excerpt: document.getElementById("newsExcerpt").value.trim(),
    content: document.getElementById("newsContent").value,
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
        newsPermissions = permissionsForResponse(data);

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

// --------------------------------------------------
// NEWS-BILDER: Upload nach R2 über die vorhandene Admin-API
// --------------------------------------------------

const newsImageFile = document.getElementById("newsImageFile");
const uploadNewsImageButton = document.getElementById("uploadNewsImage");
const newsUploadStatus = document.getElementById("newsUploadStatus");
const newsImageKeyInput = document.getElementById("newsImageKey");
const newsImagePreview = document.getElementById("newsImagePreview");
const newsPreviewImg = document.getElementById("newsPreviewImg");
const removeNewsImageButton = document.getElementById("removeNewsImage");

function showNewsImagePreview(key) {
  if (!newsImagePreview || !newsPreviewImg) return;
  if (!key) {
    newsImagePreview.hidden = true;
    newsPreviewImg.removeAttribute("src");
    return;
  }
  newsPreviewImg.src = `/media/${String(key).split("/").map(encodeURIComponent).join("/")}`;
  newsImagePreview.hidden = false;
}

uploadNewsImageButton?.addEventListener("click", async () => {
  const file = newsImageFile?.files?.[0];
  if (!file) {
    showMessage(newsMessage, "Bitte wähle zuerst ein Bild aus.", "error");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showMessage(newsMessage, "Das Bild darf maximal 8 MB groß sein.", "error");
    return;
  }
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    showMessage(newsMessage, "Erlaubt sind JPG, PNG, WEBP und GIF.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  uploadNewsImageButton.disabled = true;
  if (newsUploadStatus) newsUploadStatus.textContent = "Bild wird hochgeladen …";

  try {
    const response = await fetch("/api/admin/media/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Upload fehlgeschlagen (${response.status})`);
    }
    if (!data.key) {
      throw new Error("Der Server hat keinen Bildschlüssel zurückgegeben.");
    }

    if (newsImageKeyInput) newsImageKeyInput.value = data.key;
    showNewsImagePreview(data.key);
    if (newsUploadStatus) newsUploadStatus.textContent = "Upload erfolgreich.";
    showMessage(newsMessage, "Bild wurde hochgeladen. Speichere anschließend den Beitrag.", "success");
  } catch (error) {
    if (newsUploadStatus) newsUploadStatus.textContent = "Upload fehlgeschlagen.";
    showMessage(newsMessage, getErrorMessage(error), "error");
  } finally {
    uploadNewsImageButton.disabled = false;
  }
});

removeNewsImageButton?.addEventListener("click", () => {
  if (newsImageKeyInput) newsImageKeyInput.value = "";
  if (newsImageFile) newsImageFile.value = "";
  showNewsImagePreview("");
  if (newsUploadStatus) newsUploadStatus.textContent = "Kein Bild ausgewählt.";
});
// ==================================================
// TEAMLOGOS UND SPIELERBILDER – R2 UPLOAD
// ==================================================

const teamLogoFile = document.getElementById("teamLogoFile");
const uploadTeamLogoButton = document.getElementById("uploadTeamLogo");
const teamLogoKeyInput = document.getElementById("teamLogoKey");
const teamLogoPreview = document.getElementById("teamLogoPreview");
const teamLogoPreviewImg = document.getElementById("teamLogoPreviewImg");
const removeTeamLogoButton = document.getElementById("removeTeamLogo");

const playerImageFile = document.getElementById("playerImageFile");
const uploadPlayerImageButton = document.getElementById("uploadPlayerImage");
const playerImageKeyInput = document.getElementById("playerImageKey");
const playerImagePreview = document.getElementById("playerImagePreview");
const playerImagePreviewImg = document.getElementById("playerImagePreviewImg");
const removePlayerImageButton = document.getElementById("removePlayerImage");

// Bildvorschau anzeigen
function showRosterImagePreview(key, preview, image) {
  if (!preview || !image) return;

  if (!key) {
    preview.hidden = true;
    image.removeAttribute("src");
    return;
  }

  image.src = `/media/${String(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  preview.hidden = false;
}

// Gemeinsame Uploadfunktion für Teamlogos und Spielerbilder
async function uploadRosterImage(fileInput, button, keyInput, preview, image, folder, label) {
  const file = fileInput?.files?.[0];

  if (!file) {
    teamMessage(`Bitte wähle zuerst ein ${label} aus.`, "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    teamMessage("Das Bild darf maximal 8 MB groß sein.", "error");
    return;
  }

  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    teamMessage("Erlaubt sind JPG, PNG, WEBP und GIF.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  button.disabled = true;
  button.textContent = "Upload läuft …";

  try {
    const response = await fetch("/api/admin/media/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || data.message ||
        `Upload fehlgeschlagen (${response.status})`
      );
    }

    if (!data.key) {
      throw new Error("Der Server hat keinen Bildschlüssel zurückgegeben.");
    }

    keyInput.value = data.key;
    showRosterImagePreview(data.key, preview, image);

    fileInput.value = "";

    teamMessage(
      `${label.charAt(0).toUpperCase() + label.slice(1)} erfolgreich hochgeladen. Bitte anschließend speichern.`,
      "success"
    );

  } catch (error) {
    teamMessage(getErrorMessage(error), "error");

  } finally {
    button.disabled = false;
    button.textContent = folder === "teams"
      ? "Teamlogo hochladen"
      : "Spielerbild hochladen";
  }
}

// Teamlogo hochladen
uploadTeamLogoButton?.addEventListener("click", () => {
  uploadRosterImage(
    teamLogoFile,
    uploadTeamLogoButton,
    teamLogoKeyInput,
    teamLogoPreview,
    teamLogoPreviewImg,
    "teams",
    "Teamlogo"
  );
});

// Spielerbild hochladen
uploadPlayerImageButton?.addEventListener("click", () => {
  uploadRosterImage(
    playerImageFile,
    uploadPlayerImageButton,
    playerImageKeyInput,
    playerImagePreview,
    playerImagePreviewImg,
    "players",
    "Spielerbild"
  );
});

// Teamlogo entfernen
removeTeamLogoButton?.addEventListener("click", () => {
  teamLogoKeyInput.value = "";
  teamLogoFile.value = "";
  showRosterImagePreview("", teamLogoPreview, teamLogoPreviewImg);

  teamMessage("Teamlogo wurde aus dem Formular entfernt.", "success");
});

// Spielerbild entfernen
removePlayerImageButton?.addEventListener("click", () => {
  playerImageKeyInput.value = "";
  playerImageFile.value = "";
  showRosterImagePreview("", playerImagePreview, playerImagePreviewImg);

  teamMessage("Spielerbild wurde aus dem Formular entfernt.", "success");
});
// ==================================================
// ULTOR CMS – TEAMS, SPIELER UND KADERHISTORIE
// ==================================================

let teamPermissions = [];
let teamItems = [];
let playerItems = [];

const teamsList = document.getElementById("teamsList");
const teamsMessage = document.getElementById("teamsMessage");
const teamForm = document.getElementById("teamForm");
const teamEditor = document.getElementById("teamEditor");

const playersList = document.getElementById("playersList");
const playerForm = document.getElementById("playerForm");
const playerEditor = document.getElementById("playerEditor");

const rosterHistoryList = document.getElementById("rosterHistoryList");

let editingTeamId = null;
let editingPlayerId = null;

function teamCan(permission) {
  return window.ULTOR_IS_OWNER === true ||
    teamPermissions.includes("*") || teamPermissions.includes(permission);
}

function teamActionButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function teamStatusLabel(status) {
  return {
    active: "Aktiv",
    inactive: "Inaktiv",
    draft: "Entwurf"
  }[status] || status;
}

function teamMessage(message, type = "") {
  showMessage(teamsMessage, message, type);
}

function closeTeamEditor() {
  if (!teamEditor || !teamForm) return;

  teamEditor.hidden = true;
  teamForm.reset();
  editingTeamId = null;
}

function closePlayerEditor() {
  if (!playerEditor || !playerForm) return;

  playerEditor.hidden = true;
  playerForm.reset();
  editingPlayerId = null;
}

// ==================================================
// TEAMS LADEN
// ==================================================

async function loadTeams() {
  if (!teamsList) return;

  teamsList.replaceChildren(
    createElement("p", "muted", "Teams werden geladen …")
  );

  try {
    const data = await apiRequest("/api/admin/teams");
    teamItems = data.teams || [];

    const filter = document.getElementById("teamStatusFilter")?.value || "";

    const visibleTeams = filter
      ? teamItems.filter(team => team.status === filter)
      : teamItems;

    teamsList.replaceChildren();

    if (!visibleTeams.length) {
      teamsList.append(
        createElement("p", "muted", "Noch keine Teams vorhanden.")
      );
    }

    for (const team of visibleTeams) {
      const card = createElement("article", "news-card");
      const details = createElement("div", "news-card-details");

      details.append(
        createElement("h3", "", team.name),
        createElement(
          "p",
          "news-meta",
          `${teamStatusLabel(team.status)} · ${team.player_count || 0} Spieler`
        )
      );

      if (team.description) {
        details.append(
          createElement("p", "news-excerpt", team.description)
        );
      }

      const actions = createElement("div", "news-actions");

      if (teamCan("teams.edit")) {
        actions.append(
          teamActionButton(
            "Bearbeiten",
            "secondary-button",
            () => openTeamEditor(team)
          )
        );
      }

      if (teamCan("teams.delete")) {
        actions.append(
          teamActionButton(
            "Löschen / Deaktivieren",
            "danger-button",
            () => deleteTeam(team)
          )
        );
      }

      card.append(details, actions);
      teamsList.append(card);
    }

    updateTeamSelects();

  } catch (error) {
    teamsList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

// ==================================================
// TEAM ERSTELLEN / BEARBEITEN
// ==================================================

function openTeamEditor(team = null) {
  if (!teamForm || !teamEditor) return;

  editingTeamId = team?.id || null;

  document.getElementById("teamEditorTitle").textContent =
    team ? "Team bearbeiten" : "Neues Team erstellen";

  document.getElementById("teamId").value = team?.id || "";
  document.getElementById("teamName").value = team?.name || "";
  document.getElementById("teamDescription").value =
    team?.description || "";
  document.getElementById("teamLogoKey").value =
    team?.logo_key || "";
  showRosterImagePreview(
  team?.logo_key || "",
  teamLogoPreview,
  teamLogoPreviewImg
);
  document.getElementById("teamStatus").value =
    team?.status || "active";

  teamEditor.hidden = false;
  teamEditor.scrollIntoView({ behavior: "smooth" });
}

async function deleteTeam(team) {
  if (!window.confirm(
    `Möchtest du das Team "${team.name}" löschen bzw. deaktivieren?`
  )) return;

  try {
    const data = await apiRequest(
      `/api/admin/teams/${encodeURIComponent(team.id)}`,
      { method: "DELETE" }
    );

    teamMessage(data.message || "Team wurde bearbeitet.", "success");

    await loadTeams();
    await loadPlayers();
    await loadRosterHistory();

  } catch (error) {
    teamMessage(getErrorMessage(error), "error");
  }
}

teamForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = teamForm.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  const body = {
    name: document.getElementById("teamName").value.trim(),
    description: document.getElementById("teamDescription").value.trim(),
    logo_key: document.getElementById("teamLogoKey").value.trim(),
    status: document.getElementById("teamStatus").value
  };

  try {
    if (editingTeamId) {
      await apiRequest(
        `/api/admin/teams/${encodeURIComponent(editingTeamId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body)
        }
      );

      teamMessage("Team wurde aktualisiert.", "success");

    } else {
      await apiRequest("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify(body)
      });

      teamMessage("Team wurde erstellt.", "success");
    }

    closeTeamEditor();

    await loadTeams();
    await loadPlayers();

  } catch (error) {
    teamMessage(getErrorMessage(error), "error");

  } finally {
    if (button) button.disabled = false;
  }
});

// ==================================================
// SPIELER – TEAM-AUSWAHLEN
// ==================================================

function updateTeamSelects() {
  const selects = [
    document.getElementById("playerTeam"),
    document.getElementById("playerTeamFilter")
  ];

  for (const select of selects) {
    if (!select) continue;

    const previousValue = select.value;
    const isFilter = select.id === "playerTeamFilter";

    select.replaceChildren();

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = isFilter
      ? "Alle Teams"
      : "Team auswählen";

    select.append(defaultOption);

    for (const team of teamItems) {
      if (team.status === "inactive") continue;

      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;

      select.append(option);
    }

    if (
      previousValue &&
      Array.from(select.options).some(option =>
        option.value === previousValue
      )
    ) {
      select.value = previousValue;
    }
  }
}

// ==================================================
// SPIELER LADEN
// ==================================================

async function loadPlayers() {
  if (!playersList) return;

  playersList.replaceChildren(
    createElement("p", "muted", "Spieler werden geladen …")
  );

  try {
    const teamFilter =
      document.getElementById("playerTeamFilter")?.value || "";

    const query = teamFilter
      ? `?team_id=${encodeURIComponent(teamFilter)}`
      : "";

    const data = await apiRequest(`/api/admin/players${query}`);
    playerItems = data.players || [];

    playersList.replaceChildren();

    if (!playerItems.length) {
      playersList.append(
        createElement("p", "muted", "Noch keine Spieler vorhanden.")
      );
      return;
    }

    for (const player of playerItems) {
      const card = createElement("article", "news-card");
      const details = createElement("div", "news-card-details");

      details.append(
        createElement("h3", "", player.name),
        createElement(
          "p",
          "news-meta",
          `${player.team_name || "Kein Team"} · ${player.position || "Keine Position"}${player.is_substitute ? " · Ersatzspieler" : ""}`
        )
      );

      const actions = createElement("div", "news-actions");

      if (teamCan("teams.edit")) {
        actions.append(
          teamActionButton(
            "Bearbeiten",
            "secondary-button",
            () => openPlayerEditor(player)
          ),
          teamActionButton(
            "Entfernen",
            "danger-button",
            () => deletePlayer(player)
          )
        );
      }

      card.append(details, actions);
      playersList.append(card);
    }

  } catch (error) {
    playersList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

// ==================================================
// SPIELER ERSTELLEN / BEARBEITEN
// ==================================================

function openPlayerEditor(player = null) {
  if (!playerForm || !playerEditor) return;

  editingPlayerId = player?.id || null;

  document.getElementById("playerEditorTitle").textContent =
    player ? "Spieler bearbeiten" : "Neuen Spieler hinzufügen";

  document.getElementById("playerId").value = player?.id || "";
  document.getElementById("playerName").value = player?.name || "";
  document.getElementById("playerPosition").value =
    player?.position || "";
  document.getElementById("playerImageKey").value =
    player?.image_key || "";
  document.getElementById("playerIsSubstitute").checked =
    Boolean(player?.is_substitute);

  updateTeamSelects();

  document.getElementById("playerTeam").value =
    player?.team_id || "";

  playerEditor.hidden = false;
  playerEditor.scrollIntoView({ behavior: "smooth" });
}

async function deletePlayer(player) {
  if (!window.confirm(
    `Möchtest du "${player.name}" aus dem Team entfernen?`
  )) return;

  try {
    const data = await apiRequest(
      `/api/admin/players/${encodeURIComponent(player.id)}`,
      { method: "DELETE" }
    );

    teamMessage(data.message || "Spieler wurde entfernt.", "success");

    await loadPlayers();
    await loadTeams();
    await loadRosterHistory();

  } catch (error) {
    teamMessage(getErrorMessage(error), "error");
  }
}

playerForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = playerForm.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  const body = {
    name: document.getElementById("playerName").value.trim(),
    team_id: document.getElementById("playerTeam").value,
    position: document.getElementById("playerPosition").value.trim(),
    image_key: document.getElementById("playerImageKey").value.trim(),
    is_substitute: document.getElementById("playerIsSubstitute").checked
  };

  try {
    if (editingPlayerId) {
      await apiRequest(
        `/api/admin/players/${encodeURIComponent(editingPlayerId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body)
        }
      );

      teamMessage("Spieler wurde aktualisiert.", "success");

    } else {
      await apiRequest("/api/admin/players", {
        method: "POST",
        body: JSON.stringify(body)
      });

      teamMessage("Spieler wurde hinzugefügt.", "success");
    }

    closePlayerEditor();

    await loadPlayers();
    await loadTeams();
    await loadRosterHistory();

  } catch (error) {
    teamMessage(getErrorMessage(error), "error");

  } finally {
    if (button) button.disabled = false;
  }
});

// ==================================================
// KADERHISTORIE
// ==================================================

async function loadRosterHistory() {
  if (!rosterHistoryList) return;

  rosterHistoryList.replaceChildren(
    createElement("p", "muted", "Kaderhistorie wird geladen …")
  );

  try {
    const data = await apiRequest("/api/admin/roster-history");
    const history = data.history || [];

    rosterHistoryList.replaceChildren();

    if (!history.length) {
      rosterHistoryList.append(
        createElement("p", "muted", "Noch keine Kaderbewegungen vorhanden.")
      );
      return;
    }

    const labels = {
      joined: "Beigetreten",
      left: "Ausgetreten",
      transferred: "Teamwechsel"
    };

    for (const entry of history) {
      const card = createElement("article", "news-card");
      const details = createElement("div", "news-card-details");

      details.append(
        createElement(
          "h3",
          "",
          labels[entry.action] || entry.action
        ),
        createElement(
          "p",
          "news-meta",
          `${entry.team_name || "Unbekanntes Team"} · ${entry.changed_by_name || "Unbekannt"} · ${entry.created_at || ""}`
        ),
        createElement(
          "p",
          "news-excerpt",
          entry.description || ""
        )
      );

      card.append(details);
      rosterHistoryList.append(card);
    }

  } catch (error) {
    rosterHistoryList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

// ==================================================
// BUTTONS UND FILTER
// ==================================================

document.getElementById("createTeamButton")
  ?.addEventListener("click", () => {
    if (!teamCan("teams.create")) {
      teamMessage("Du hast keine Berechtigung, Teams zu erstellen.", "error");
      return;
    }

    openTeamEditor();
  });

document.getElementById("closeTeamEditor")
  ?.addEventListener("click", closeTeamEditor);

document.getElementById("cancelTeamEditor")
  ?.addEventListener("click", closeTeamEditor);

document.getElementById("createPlayerButton")
  ?.addEventListener("click", () => {
    if (!teamCan("teams.edit")) {
      teamMessage("Du hast keine Berechtigung, Spieler zu verwalten.", "error");
      return;
    }

    if (!teamItems.some(team => team.status !== "inactive")) {
      teamMessage("Erstelle zuerst ein aktives Team.", "error");
      return;
    }

    openPlayerEditor();
  });

document.getElementById("closePlayerEditor")
  ?.addEventListener("click", closePlayerEditor);

document.getElementById("cancelPlayerEditor")
  ?.addEventListener("click", closePlayerEditor);

document.getElementById("teamStatusFilter")
  ?.addEventListener("change", loadTeams);

document.getElementById("playerTeamFilter")
  ?.addEventListener("change", loadPlayers);

// ==================================================
// BERECHTIGUNGEN UND NAVIGATION
// ==================================================

const previousTeamsOpenCmsView = openCmsView;

openCmsView = function(viewName) {
  previousTeamsOpenCmsView(viewName);

  if (viewName !== "teams") return;

  apiRequest("/api/admin/me")
    .then(data => {
      teamPermissions = permissionsForResponse(data);

      const canView = teamCan("teams.view");

      if (!canView) {
        teamMessage(
          "Du hast keine Berechtigung, die Teamverwaltung aufzurufen.",
          "error"
        );

        teamsList?.replaceChildren();
        playersList?.replaceChildren();
        rosterHistoryList?.replaceChildren();

        return;
      }

      const createTeamButton =
        document.getElementById("createTeamButton");

      const createPlayerButton =
        document.getElementById("createPlayerButton");

      if (createTeamButton) {
        createTeamButton.hidden = !teamCan("teams.create");
      }

      if (createPlayerButton) {
        createPlayerButton.hidden = !teamCan("teams.edit");
      }

      loadTeams().then(() => {
        loadPlayers();
        loadRosterHistory();
      });
    })
    .catch(error => {
      teamMessage(getErrorMessage(error), "error");
    });
};

newsImageKeyInput?.addEventListener("input", () =>
  showNewsImagePreview(newsImageKeyInput.value.trim())
);

// ==================================================
// ULTOR CMS – PARTNER VERWALTUNG
// ==================================================

let partnerPermissions = [];
let partnerItems = [];
let editingPartnerId = null;

const partnersList = document.getElementById("partnersList");
const partnersMessage = document.getElementById("partnersMessage");
const partnerEditor = document.getElementById("partnerEditor");
const partnerForm = document.getElementById("partnerForm");

const partnerLogoFile = document.getElementById("partnerLogoFile");
const uploadPartnerLogoButton = document.getElementById("uploadPartnerLogo");
const partnerUploadStatus = document.getElementById("partnerUploadStatus");
const partnerLogoPreview = document.getElementById("partnerLogoPreview");
const partnerLogoPreviewImg = document.getElementById("partnerLogoPreviewImg");
const partnerLogoKeyInput = document.getElementById("partnerLogoKey");
const removePartnerLogoButton = document.getElementById("removePartnerLogo");

function partnerCan(permission) {
  return window.ULTOR_IS_OWNER === true ||
    partnerPermissions.includes("*") || partnerPermissions.includes(permission);
}

function partnerMessage(message, type = "") {
  showMessage(partnersMessage, message, type);
}

function partnerButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function partnerStatusLabel(status) {
  return status === "active" ? "Aktiv" : "Inaktiv";
}

function showPartnerLogoPreview(key) {
  if (!partnerLogoPreview || !partnerLogoPreviewImg) return;

  if (!key) {
    partnerLogoPreview.hidden = true;
    partnerLogoPreviewImg.removeAttribute("src");
    return;
  }

  partnerLogoPreviewImg.src = `/media/${String(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  partnerLogoPreview.hidden = false;
}

function closePartnerEditor() {
  if (!partnerEditor || !partnerForm) return;

  partnerEditor.hidden = true;
  partnerForm.reset();
  editingPartnerId = null;

  if (partnerLogoPreview) {
    partnerLogoPreview.hidden = true;
  }

  if (partnerLogoPreviewImg) {
    partnerLogoPreviewImg.removeAttribute("src");
  }

  if (partnerUploadStatus) {
    partnerUploadStatus.textContent = "";
  }
}

function openPartnerEditor(partner = null) {
  if (!partnerEditor || !partnerForm) return;

  editingPartnerId = partner?.id || null;

  document.getElementById("partnerEditorTitle").textContent =
    partner ? "Partner bearbeiten" : "Neuen Partner erstellen";

  document.getElementById("partnerId").value = partner?.id || "";
  document.getElementById("partnerName").value = partner?.name || "";
  document.getElementById("partnerDescription").value =
    partner?.description || "";
  document.getElementById("partnerWebsite").value =
    partner?.website_url || "";
  document.getElementById("partnerLogoKey").value =
    partner?.logo_key || "";
  document.getElementById("partnerStatus").value =
    partner?.status || "inactive";

  showPartnerLogoPreview(partner?.logo_key || "");

  partnerEditor.hidden = false;
  partnerEditor.scrollIntoView({ behavior: "smooth" });
}

async function loadPartners() {
  if (!partnersList) return;

  partnersList.replaceChildren(
    createElement("p", "muted", "Partner werden geladen …")
  );

  try {
    const data = await apiRequest("/api/admin/partners");
    partnerItems = data.partners || [];

    const filter =
      document.getElementById("partnerStatusFilter")?.value || "";

    const visiblePartners = filter
      ? partnerItems.filter(partner => partner.status === filter)
      : partnerItems;

    partnersList.replaceChildren();

    if (!visiblePartners.length) {
      partnersList.append(
        createElement("p", "muted", "Keine Partner vorhanden.")
      );
      return;
    }

    for (const partner of visiblePartners) {
      const card = createElement("article", "news-card");
      const details = createElement("div", "news-card-details");

      details.append(
        createElement("h3", "", partner.name),
        createElement(
          "p",
          "news-meta",
          `${partnerStatusLabel(partner.status)} · ${partner.website_url || "Keine Website"}`
        )
      );

      if (partner.description) {
        details.append(
          createElement("p", "news-excerpt", partner.description)
        );
      }

      const actions = createElement("div", "news-actions");

      if (partnerCan("partners.edit")) {
        actions.append(
          partnerButton(
            "Bearbeiten",
            "secondary-button",
            () => openPartnerEditor(partner)
          )
        );
      }

      if (partnerCan("partners.publish")) {
        if (partner.status === "active") {
          actions.append(
            partnerButton(
              "Deaktivieren",
              "secondary-button",
              () => changePartnerStatus(partner, "deactivate")
            )
          );
        } else {
          actions.append(
            partnerButton(
              "Aktivieren",
              "primary-button",
              () => changePartnerStatus(partner, "activate")
            )
          );
        }
      }

      if (partnerCan("partners.delete")) {
        actions.append(
          partnerButton(
            "Löschen",
            "danger-button",
            () => deletePartner(partner)
          )
        );
      }

      card.append(details, actions);
      partnersList.append(card);
    }
  } catch (error) {
    partnersList.replaceChildren(
      createElement("p", "message error", getErrorMessage(error))
    );
  }
}

async function changePartnerStatus(partner, action) {
  const actionText = action === "activate"
    ? "aktivieren"
    : "deaktivieren";

  if (!window.confirm(
    `Möchtest du den Partner "${partner.name}" wirklich ${actionText}?`
  )) return;

  try {
    const data = await apiRequest(
      `/api/admin/partners/${encodeURIComponent(partner.id)}/${action}`,
      {
        method: "POST",
        body: "{}"
      }
    );

    partnerMessage(
      data.message || `Partner wurde ${actionText}.`,
      "success"
    );

    await loadPartners();
  } catch (error) {
    partnerMessage(getErrorMessage(error), "error");
  }
}

async function deletePartner(partner) {
  if (!window.confirm(
    `Möchtest du den Partner "${partner.name}" endgültig löschen?`
  )) return;

  try {
    const data = await apiRequest(
      `/api/admin/partners/${encodeURIComponent(partner.id)}`,
      { method: "DELETE" }
    );

    partnerMessage(
      data.message || "Partner wurde gelöscht.",
      "success"
    );

    await loadPartners();
  } catch (error) {
    partnerMessage(getErrorMessage(error), "error");
  }
}

// Partner erstellen und bearbeiten
partnerForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = partnerForm.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  const requestedStatus =
    document.getElementById("partnerStatus").value;

  const body = {
    name: document.getElementById("partnerName").value.trim(),
    description: document.getElementById("partnerDescription").value.trim(),
    website_url: document.getElementById("partnerWebsite").value.trim(),
    logo_key: document.getElementById("partnerLogoKey").value.trim() || null
  };

  try {
    let savedPartnerId = editingPartnerId;

    if (editingPartnerId) {
      await apiRequest(
        `/api/admin/partners/${encodeURIComponent(editingPartnerId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body)
        }
      );

      partnerMessage("Partner wurde aktualisiert.", "success");
    } else {
      const data = await apiRequest("/api/admin/partners", {
        method: "POST",
        body: JSON.stringify(body)
      });

      savedPartnerId = data.partner?.id || data.id;

      if (!savedPartnerId) {
        throw new Error(
          "Der Partner wurde erstellt, aber der Server hat keine Partner-ID zurückgegeben."
        );
      }

      partnerMessage("Partner wurde erstellt.", "success");
    }

    const currentPartner = partnerItems.find(
      partner => partner.id === savedPartnerId
    );

    const currentStatus = currentPartner?.status || "inactive";

    if (requestedStatus !== currentStatus) {
      const action = requestedStatus === "active"
        ? "activate"
        : "deactivate";

      await apiRequest(
        `/api/admin/partners/${encodeURIComponent(savedPartnerId)}/${action}`,
        {
          method: "POST",
          body: "{}"
        }
      );
    }

    closePartnerEditor();
    await loadPartners();

  } catch (error) {
    partnerMessage(getErrorMessage(error), "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// Partnerlogo hochladen
uploadPartnerLogoButton?.addEventListener("click", async () => {
  const file = partnerLogoFile?.files?.[0];

  if (!file) {
    partnerMessage("Bitte wähle zuerst ein Logo aus.", "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    partnerMessage("Das Logo darf maximal 8 MB groß sein.", "error");
    return;
  }

  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    partnerMessage("Erlaubt sind JPG, PNG, WEBP und GIF.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "partners");

  uploadPartnerLogoButton.disabled = true;

  if (partnerUploadStatus) {
    partnerUploadStatus.textContent = "Logo wird hochgeladen …";
  }

  try {
    const response = await fetch("/api/admin/media/upload", {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || data.message ||
        `Upload fehlgeschlagen (${response.status})`
      );
    }

    if (!data.key) {
      throw new Error("Der Server hat keinen Bildschlüssel zurückgegeben.");
    }

    partnerLogoKeyInput.value = data.key;
    showPartnerLogoPreview(data.key);
    partnerLogoFile.value = "";

    if (partnerUploadStatus) {
      partnerUploadStatus.textContent = "Upload erfolgreich.";
    }

    partnerMessage(
      "Partnerlogo wurde hochgeladen. Speichere anschließend den Partner.",
      "success"
    );
  } catch (error) {
    if (partnerUploadStatus) {
      partnerUploadStatus.textContent = "Upload fehlgeschlagen.";
    }

    partnerMessage(getErrorMessage(error), "error");
  } finally {
    uploadPartnerLogoButton.disabled = false;
  }
});

// Logo entfernen
removePartnerLogoButton?.addEventListener("click", () => {
  if (partnerLogoKeyInput) partnerLogoKeyInput.value = "";
  if (partnerLogoFile) partnerLogoFile.value = "";

  showPartnerLogoPreview("");

  if (partnerUploadStatus) {
    partnerUploadStatus.textContent = "Kein Logo ausgewählt.";
  }
});

// Logo-Vorschau bei manueller Änderung des Schlüssels
partnerLogoKeyInput?.addEventListener("input", () => {
  showPartnerLogoPreview(partnerLogoKeyInput.value.trim());
});

// Buttons und Filter
document.getElementById("createPartnerButton")
  ?.addEventListener("click", () => {
    if (!partnerCan("partners.create")) {
      partnerMessage(
        "Du hast keine Berechtigung, Partner zu erstellen.",
        "error"
      );
      return;
    }

    openPartnerEditor();
  });

document.getElementById("closePartnerEditor")
  ?.addEventListener("click", closePartnerEditor);

document.getElementById("cancelPartnerEditor")
  ?.addEventListener("click", closePartnerEditor);

document.getElementById("partnerStatusFilter")
  ?.addEventListener("change", loadPartners);

// Partnerbereich beim Öffnen laden
const previousPartnersOpenCmsView = openCmsView;

openCmsView = function(viewName) {
  previousPartnersOpenCmsView(viewName);

  if (viewName !== "partners") return;

  apiRequest("/api/admin/me")
    .then(data => {
      partnerPermissions = permissionsForResponse(data);

      if (!partnerCan("partners.view")) {
        partnerMessage(
          "Du hast keine Berechtigung, die Partnerverwaltung aufzurufen.",
          "error"
        );

        partnersList?.replaceChildren();
        return;
      }

      const createButton =
        document.getElementById("createPartnerButton");

      if (createButton) {
        createButton.hidden = !partnerCan("partners.create");
      }

      loadPartners();
    })
    .catch(error => {
      partnerMessage(getErrorMessage(error), "error");
    });
};

// ==================================================
// ULTOR SHOP CMS – PRODUKTE, BILDER, VARIANTEN, KATEGORIEN
// Dieser Bereich ist bewusst gekapselt und verändert keine anderen CMS-Module.
// ==================================================
(() => {
  const $ = id => document.getElementById(id);
  const message = $('shopMessage');
  const productsList = $('shopProductsList');
  const categoriesList = $('shopCategoriesList');
  const productEditor = $('shopProductEditor');
  const categoryEditor = $('shopCategoryEditor');

  if (!message || !productsList || !categoriesList || !productEditor || !categoryEditor) {
    console.warn('ULTOR Shop: Die Shop-Oberfläche fehlt in admin/index.html.');
    return;
  }

  let shopPermissions = [];
  let shopProducts = [];
  let shopCategories = [];
  let editingProductId = null;
  let editingVariantId = null;
  let loadedProductDetails = null;
  let isLoading = false;

  const canShop = permission => window.ULTOR_IS_OWNER === true ||
    shopPermissions.includes('*') || shopPermissions.includes(permission);
  const moneyToCents = value => value === '' ? null : Math.round(Number(value) * 100);
  const centsToMoney = value => value == null ? '' : (Number(value) / 100).toFixed(2);
  const slugify = value => String(value || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const money = (cents, currency = 'EUR') => cents == null
    ? 'Preis folgt'
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(cents) / 100);
  const showShopMessage = (text, type = '') => showMessage(message, text, type);
  const text = (value, fallback = '–') => value == null || value === '' ? fallback : String(value);

  async function shopRequest(path, options = {}) {
    return apiRequest(`/api/admin/shop${path}`, options);
  }

  function actionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function mediaUrl(key) {
    return `/media/${String(key).split('/').map(encodeURIComponent).join('/')}`;
  }

  function closeProductEditor() {
    productEditor.hidden = true;
    $('shopProductForm')?.reset();
    $('shopProductId').value = '';
    $('shopVariantEditor').hidden = true;
    $('shopImageEditor').hidden = true;
    editingProductId = null;
    editingVariantId = null;
    loadedProductDetails = null;
    resetVariantForm();
  }

  function closeCategoryEditor() {
    categoryEditor.hidden = true;
    $('shopCategoryForm')?.reset();
    $('shopCategoryId').value = '';
  }

  function resetVariantForm() {
    const form = $('shopVariantForm');
    if (!form) return;
    form.reset();
    $('shopVariantId').value = '';
    editingVariantId = null;
    $('shopVariantEditorTitle').textContent = 'Variante hinzufügen';
    $('shopVariantStock').value = '0';
    $('shopVariantTrackInventory').checked = true;
    $('shopVariantStatus').value = 'active';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Variante hinzufügen';
  }

  function renderCategoryChoices(selected = []) {
    const container = $('shopProductCategoryChoices');
    if (!container) return;
    container.replaceChildren();

    const selectedIds = new Set((Array.isArray(selected) ? selected : []).map(id => String(id)));
    const availableCategories = Array.isArray(shopCategories) ? shopCategories : [];

    if (!availableCategories.some(category => category.status === 'active')) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Lege zuerst eine aktive Kategorie an.';
      container.append(empty);
      return;
    }

    // Native details/summary gives us an accessible dropdown without changing
    // the existing category_ids API payload or the product save workflow.
    const dropdown = document.createElement('details');
    dropdown.className = 'shop-category-dropdown';

    const summary = document.createElement('summary');
    summary.className = 'shop-category-dropdown-trigger';

    const summaryText = document.createElement('span');
    summaryText.className = 'shop-category-dropdown-text';

    const summaryMeta = document.createElement('span');
    summaryMeta.className = 'shop-category-dropdown-meta';

    const updateSummary = () => {
      const checked = Array.from(dropdown.querySelectorAll('input[name="shopCategoryIds"]:checked'));
      const names = checked.map(input => input.dataset.categoryName || input.value);
      if (!names.length) {
        summaryText.textContent = 'Shop-Kategorien auswählen';
      } else if (names.length <= 2) {
        summaryText.textContent = names.join(' · ');
      } else {
        summaryText.textContent = `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
      }
      summaryMeta.textContent = names.length === 1 ? '1 ausgewählt' : `${names.length} ausgewählt`;
    };

    summary.append(summaryText, summaryMeta);
    const menu = document.createElement('div');
    menu.className = 'shop-category-dropdown-menu';

    availableCategories.forEach(category => {
      const isActive = category.status === 'active';
      const isSelected = selectedIds.has(String(category.id));

      const label = document.createElement('label');
      label.className = 'shop-category-choice';
      if (!isActive) label.classList.add('is-inactive');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'shopCategoryIds';
      checkbox.value = String(category.id);
      checkbox.dataset.categoryName = category.name || 'Kategorie';
      checkbox.checked = isSelected;
      // Inactive categories cannot be newly assigned. Existing assignments
      // remain visible and can be unchecked to remove them.
      checkbox.disabled = !isActive && !isSelected;
      checkbox.addEventListener('change', updateSummary);

      const categoryLabel = document.createElement('span');
      categoryLabel.textContent = isActive ? category.name : `${category.name} (inaktiv)`;
      label.append(checkbox, categoryLabel);
      menu.append(label);
    });

    dropdown.append(summary, menu);
    container.append(dropdown);
    updateSummary();
  }

  function renderProducts() {
    productsList.replaceChildren();
    const filter = $('shopProductStatusFilter')?.value || '';
    const query = ($('shopProductSearch')?.value || '').trim().toLocaleLowerCase('de-DE');
    const filtered = shopProducts.filter(product => {
      const matchesStatus = !filter || product.status === filter;
      const haystack = `${product.name || ''} ${product.slug || ''} ${product.short_description || ''}`.toLocaleLowerCase('de-DE');
      return matchesStatus && (!query || haystack.includes(query));
    });

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = shopProducts.length
        ? 'Keine Produkte passen zu deiner Suche.'
        : 'Noch keine Produkte vorhanden. Erstelle dein erstes ULTOR-Produkt.';
      productsList.append(empty);
      return;
    }

    filtered.forEach(product => {
      const card = document.createElement('article');
      card.className = 'news-card shop-product-card';
      const imageWrap = document.createElement('div');
      imageWrap.className = 'shop-product-thumb';
      if (product.primary_image) {
        const image = document.createElement('img');
        image.src = mediaUrl(product.primary_image);
        image.alt = product.name || 'Produktbild';
        image.loading = 'lazy';
        imageWrap.append(image);
      } else {
        imageWrap.textContent = 'ULTOR';
      }

      const details = document.createElement('div');
      details.className = 'news-card-details shop-product-details';
      const title = document.createElement('h3');
      title.textContent = product.name;
      const meta = document.createElement('p');
      meta.className = 'news-meta';
      meta.textContent = `${money(product.price_cents, product.currency || 'EUR')} · /${product.slug || ''}`;
      const status = document.createElement('span');
      status.className = `shop-status ${product.status || 'draft'}`;
      status.textContent = ({ draft: 'Entwurf', published: 'Veröffentlicht', archived: 'Archiviert' })[product.status] || product.status || 'Unbekannt';
      details.append(title, meta, status);
      if (product.short_description) {
        const desc = document.createElement('p');
        desc.className = 'news-excerpt';
        desc.textContent = product.short_description;
        details.append(desc);
      }

      const actions = document.createElement('div');
      actions.className = 'news-actions';
      if (canShop('shop.products.edit')) {
        actions.append(actionButton('Bearbeiten', 'secondary-button', () => openProductEditor(product.id)));
      }
      if (canShop('shop.products.publish')) {
        if (product.status === 'published') {
          actions.append(actionButton('Zurückziehen', 'secondary-button', () => changeProductStatus(product, 'unpublish')));
        } else if (product.status !== 'archived') {
          actions.append(actionButton('Veröffentlichen', 'primary-button', () => changeProductStatus(product, 'publish')));
        }
      }
      if (canShop('shop.products.delete')) {
        actions.append(actionButton('Löschen', 'danger-button', () => deleteProduct(product)));
      }
      card.append(imageWrap, details, actions);
      productsList.append(card);
    });
  }

  function renderCategories() {
    categoriesList.replaceChildren();
    if (!shopCategories.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Noch keine Kategorien vorhanden.';
      categoriesList.append(empty);
      return;
    }

    shopCategories.forEach(category => {
      const card = document.createElement('article');
      card.className = 'news-card';
      const details = document.createElement('div');
      details.className = 'news-card-details';
      const title = document.createElement('h3');
      title.textContent = category.name;
      const meta = document.createElement('p');
      meta.className = 'news-meta';
      meta.textContent = `/${category.slug || ''} · ${category.status === 'active' ? 'Aktiv' : 'Inaktiv'} · Sortierung ${category.sort_order ?? 0}`;
      details.append(title, meta);
      if (category.description) {
        const description = document.createElement('p');
        description.className = 'news-excerpt';
        description.textContent = category.description;
        details.append(description);
      }
      const actions = document.createElement('div');
      actions.className = 'news-actions';
      if (canShop('shop.categories.manage')) {
        actions.append(
          actionButton('Bearbeiten', 'secondary-button', () => openCategoryEditor(category)),
          actionButton('Löschen', 'danger-button', () => deleteCategory(category))
        );
      }
      card.append(details, actions);
      categoriesList.append(card);
    });
  }

  async function loadShop() {
    if (isLoading) return;
    isLoading = true;
    productsList.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Produkte werden geladen …' }));
    categoriesList.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Kategorien werden geladen …' }));

    try {
      const me = await apiRequest('/api/admin/me');
      shopPermissions = permissionsForResponse(me);
      if (!canShop('shop.view')) {
        showShopMessage('Du hast keine Berechtigung, die Shop-Verwaltung aufzurufen.', 'error');
        productsList.replaceChildren();
        categoriesList.replaceChildren();
        $('createShopProductButton').hidden = true;
        $('createShopCategoryButton').hidden = true;
        return;
      }

      const shopNav = document.querySelector('.nav-item[data-view="shop"]');
      if (shopNav) shopNav.hidden = !canShop('shop.view');
      $('createShopProductButton').hidden = !canShop('shop.products.create');
      $('createShopCategoryButton').hidden = !canShop('shop.categories.manage');

      const [productsData, categoriesData] = await Promise.all([
        shopRequest('/products'),
        shopRequest('/categories')
      ]);
      shopProducts = Array.isArray(productsData.products) ? productsData.products : [];
      shopCategories = Array.isArray(categoriesData.categories) ? categoriesData.categories : [];
      renderProducts();
      renderCategories();
      renderCategoryChoices();
      showShopMessage(`${shopProducts.length} Produkte und ${shopCategories.length} Kategorien geladen.`, 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
      productsList.replaceChildren();
      categoriesList.replaceChildren();
    } finally {
      isLoading = false;
    }
  }

  async function openProductEditor(productId = null) {
    const isNew = !productId;
    if (isNew && !canShop('shop.products.create')) {
      showShopMessage('Du hast keine Berechtigung, Produkte zu erstellen.', 'error');
      return;
    }
    if (!isNew && !canShop('shop.products.edit')) {
      showShopMessage('Du hast keine Berechtigung, Produkte zu bearbeiten.', 'error');
      return;
    }

    $('shopProductForm').reset();
    editingProductId = productId;
    loadedProductDetails = null;
    $('shopProductId').value = productId || '';
    $('shopProductEditorTitle').textContent = isNew ? 'Neues Produkt erstellen' : 'Produkt bearbeiten';
    $('shopProductStatus').value = 'draft';
    $('shopProductCurrency').value = 'EUR';
    $('shopProductSortOrder').value = '0';
    $('shopProductFeatured').checked = false;
    $('shopProductStatus').disabled = !canShop('shop.products.publish');
    renderCategoryChoices([]);
    $('shopProductImages').replaceChildren();
    $('shopVariantsList').replaceChildren();
    $('shopImageEditor').hidden = isNew || !canShop('shop.products.edit');
    $('shopVariantEditor').hidden = isNew || !canShop('shop.products.edit');

    productEditor.hidden = false;
    productEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (isNew) return;

    showShopMessage('Produktdetails werden geladen …');
    try {
      const data = await shopRequest(`/products/${encodeURIComponent(productId)}`);
      const product = data.product;
      if (!product) throw new Error('Die Produktdetails fehlen in der API-Antwort.');
      loadedProductDetails = product;
      $('shopProductName').value = product.name || '';
      $('shopProductSlug').value = product.slug || '';
      $('shopProductShortDescription').value = product.short_description || '';
      $('shopProductDescription').value = product.description || '';
      $('shopProductPrice').value = centsToMoney(product.price_cents);
      $('shopProductComparePrice').value = centsToMoney(product.compare_at_price_cents);
      $('shopProductCurrency').value = product.currency || 'EUR';
      $('shopProductStatus').value = product.status || 'draft';
      $('shopProductStatus').disabled = !canShop('shop.products.publish');
      $('shopProductSortOrder').value = product.sort_order ?? 0;
      $('shopProductFeatured').checked = Boolean(product.is_featured);
      renderCategoryChoices(product.category_ids || []);
      renderProductImages(product.images || []);
      renderVariants(product.variants || []);
      $('shopImageEditor').hidden = !canShop('shop.products.edit');
      $('shopVariantEditor').hidden = !canShop('shop.products.edit');
      showShopMessage('Produktdetails geladen.');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  function openCategoryEditor(category = null) {
    if (!canShop('shop.categories.manage')) {
      showShopMessage('Du hast keine Berechtigung, Kategorien zu verwalten.', 'error');
      return;
    }
    $('shopCategoryForm').reset();
    $('shopCategoryId').value = category?.id || '';
    $('shopCategoryEditorTitle').textContent = category ? 'Kategorie bearbeiten' : 'Neue Kategorie erstellen';
    $('shopCategoryName').value = category?.name || '';
    $('shopCategorySlug').value = category?.slug || '';
    $('shopCategoryDescription').value = category?.description || '';
    $('shopCategorySortOrder').value = category?.sort_order ?? 0;
    $('shopCategoryStatus').value = category?.status || 'active';
    categoryEditor.hidden = false;
    categoryEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $('shopProductForm').querySelector('button[type="submit"]');
    button.disabled = true;
    const name = $('shopProductName').value.trim();
    const payload = {
      name,
      slug: slugify($('shopProductSlug').value || name),
      short_description: $('shopProductShortDescription').value.trim(),
      description: $('shopProductDescription').value.trim(),
      price_cents: moneyToCents($('shopProductPrice').value),
      compare_at_price_cents: moneyToCents($('shopProductComparePrice').value),
      currency: $('shopProductCurrency').value || 'EUR',
      status: $('shopProductStatus').value,
      sort_order: Number($('shopProductSortOrder').value || 0),
      is_featured: $('shopProductFeatured').checked
    };
    const category_ids = Array.from(document.querySelectorAll('input[name="shopCategoryIds"]:checked')).map(input => input.value);

    try {
      if (editingProductId) {
        await shopRequest(`/products/${encodeURIComponent(editingProductId)}`, {
          method: 'PATCH', body: JSON.stringify(payload)
        });
        await shopRequest(`/products/${encodeURIComponent(editingProductId)}/categories`, {
          method: 'PUT', body: JSON.stringify({ category_ids })
        });
        showShopMessage('Produkt wurde aktualisiert.', 'success');
      } else {
        const created = await shopRequest('/products', {
          method: 'POST', body: JSON.stringify(payload)
        });
        editingProductId = created.id;
        $('shopProductId').value = created.id;
        if (category_ids.length) {
          await shopRequest(`/products/${encodeURIComponent(created.id)}/categories`, {
            method: 'PUT', body: JSON.stringify({ category_ids })
          });
        }
        $('shopProductEditorTitle').textContent = 'Produkt bearbeiten';
        $('shopImageEditor').hidden = !canShop('shop.products.edit');
        $('shopVariantEditor').hidden = !canShop('shop.products.edit');
        showShopMessage('Produkt wurde als Entwurf erstellt. Du kannst jetzt Bilder und Varianten hinzufügen.', 'success');
      }
      await loadShop();
      if (editingProductId) {
        const currentId = editingProductId;
        await openProductEditor(currentId);
      }
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  function renderProductImages(images) {
    const container = $('shopProductImages');
    container.replaceChildren();
    if (!images.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Noch keine Produktbilder vorhanden.';
      container.append(empty);
      return;
    }

    images.forEach(imageData => {
      const card = document.createElement('div');
      card.className = 'shop-image-card';
      const image = document.createElement('img');
      image.src = mediaUrl(imageData.image_key);
      image.alt = imageData.alt_text || 'Produktbild';
      image.loading = 'lazy';
      const meta = document.createElement('div');
      meta.className = 'shop-image-meta';
      const title = document.createElement('strong');
      title.textContent = imageData.is_primary ? 'Hauptbild' : 'Produktbild';
      const alt = document.createElement('span');
      alt.textContent = imageData.alt_text || 'Kein Alt-Text';
      meta.append(title, alt);
      const actions = document.createElement('div');
      actions.className = 'news-actions';
      if (!imageData.is_primary) {
        actions.append(actionButton('Als Hauptbild', 'secondary-button', () => setPrimaryProductImage(imageData)));
      }
      actions.append(actionButton('Entfernen', 'danger-button', () => deleteProductImage(imageData)));
      card.append(image, meta, actions);
      container.append(card);
    });
  }

  async function uploadProductImage() {
    if (!editingProductId) {
      showShopMessage('Speichere das Produkt zuerst, bevor du Bilder hinzufügst.', 'error');
      return;
    }
    if (!canShop('shop.products.edit')) {
      showShopMessage('Du hast keine Berechtigung, Produktbilder zu bearbeiten.', 'error');
      return;
    }
    const file = $('shopProductImageFile').files?.[0];
    if (!file) {
      showShopMessage('Bitte wähle zuerst ein Bild aus.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showShopMessage('Das Bild darf maximal 8 MB groß sein.', 'error');
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      showShopMessage('Erlaubt sind JPG, PNG, WEBP und GIF.', 'error');
      return;
    }

    const button = $('uploadShopProductImageButton');
    button.disabled = true;
    button.textContent = 'Upload läuft …';
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'shop');
      const response = await fetch('/api/admin/media/upload', {
        method: 'POST', credentials: 'same-origin', body: formData
      });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(uploaded.error || uploaded.message || `Upload fehlgeschlagen (${response.status})`);
      if (!uploaded.key || !/^shop\/[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(uploaded.key)) {
        throw new Error('Der Upload lieferte keinen gültigen Shop-Bildschlüssel zurück.');
      }

      await shopRequest(`/products/${encodeURIComponent(editingProductId)}/images`, {
        method: 'POST',
        body: JSON.stringify({
          image_key: uploaded.key,
          alt_text: $('shopProductImageAlt').value.trim(),
          is_primary: $('shopProductImagePrimary').checked || !(loadedProductDetails?.images || []).length,
          sort_order: (loadedProductDetails?.images || []).length
        })
      });
      $('shopProductImageFile').value = '';
      $('shopProductImageAlt').value = '';
      $('shopProductImagePrimary').checked = false;
      await reloadProductDetails();
      showShopMessage('Produktbild wurde hochgeladen und gespeichert.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Bild hochladen';
    }
  }

  async function setPrimaryProductImage(imageData) {
    try {
      await shopRequest(`/images/${encodeURIComponent(imageData.id)}`, {
        method: 'PATCH', body: JSON.stringify({ is_primary: true })
      });
      await reloadProductDetails();
      await loadShop();
      showShopMessage('Hauptbild wurde geändert.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  async function deleteProductImage(imageData) {
    if (!confirm('Dieses Produktbild wirklich entfernen?')) return;
    try {
      await shopRequest(`/images/${encodeURIComponent(imageData.id)}`, { method: 'DELETE' });
      await reloadProductDetails();
      showShopMessage('Produktbild wurde entfernt.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  function renderVariants(variants) {
    const container = $('shopVariantsList');
    container.replaceChildren();
    if (!variants.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Noch keine Varianten angelegt.';
      container.append(empty);
      return;
    }

    variants.forEach(variant => {
      const card = document.createElement('article');
      card.className = 'shop-variant-card';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = variant.variant_name;
      const options = [
        [variant.option1_name, variant.option1_value],
        [variant.option2_name, variant.option2_value],
        [variant.option3_name, variant.option3_value]
      ].filter(pair => pair[0] && pair[1]).map(pair => `${pair[0]}: ${pair[1]}`).join(' · ');
      const meta = document.createElement('p');
      meta.className = 'news-meta';
      meta.textContent = [variant.sku ? `SKU ${variant.sku}` : '', options, `Bestand: ${variant.track_inventory ? variant.stock_quantity : 'nicht verfolgt'}`, variant.price_cents != null ? money(variant.price_cents) : 'Standardpreis'].filter(Boolean).join(' · ');
      details.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'news-actions';
      if (canShop('shop.products.edit')) {
        actions.append(
          actionButton('Bearbeiten', 'secondary-button', () => openVariantEditor(variant)),
          actionButton('Löschen', 'danger-button', () => deleteVariant(variant))
        );
      }
      card.append(details, actions);
      container.append(card);
    });
  }

  function openVariantEditor(variant = null) {
    editingVariantId = variant?.id || null;
    $('shopVariantForm').reset();
    $('shopVariantId').value = variant?.id || '';
    $('shopVariantName').value = variant?.variant_name || '';
    $('shopVariantSku').value = variant?.sku || '';
    $('shopVariantOption1Name').value = variant?.option1_name || '';
    $('shopVariantOption1Value').value = variant?.option1_value || '';
    $('shopVariantOption2Name').value = variant?.option2_name || '';
    $('shopVariantOption2Value').value = variant?.option2_value || '';
    $('shopVariantOption3Name').value = variant?.option3_name || '';
    $('shopVariantOption3Value').value = variant?.option3_value || '';
    $('shopVariantPrice').value = centsToMoney(variant?.price_cents);
    $('shopVariantComparePrice').value = centsToMoney(variant?.compare_at_price_cents);
    $('shopVariantStock').value = variant?.stock_quantity ?? 0;
    $('shopVariantTrackInventory').checked = variant ? Boolean(variant.track_inventory) : true;
    $('shopVariantStatus').value = variant?.status || 'active';
    $('shopVariantSortOrder').value = variant?.sort_order ?? 0;
    $('shopVariantEditorTitle').textContent = variant ? 'Variante bearbeiten' : 'Variante hinzufügen';
    const submit = $('shopVariantForm').querySelector('button[type="submit"]');
    submit.textContent = variant ? 'Änderungen speichern' : 'Variante hinzufügen';
    $('shopVariantForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveVariant(event) {
    event.preventDefault();
    if (!editingProductId) return;
    const button = $('shopVariantForm').querySelector('button[type="submit"]');
    button.disabled = true;
    const payload = {
      variant_name: $('shopVariantName').value.trim(),
      sku: $('shopVariantSku').value.trim(),
      option1_name: $('shopVariantOption1Name').value.trim(),
      option1_value: $('shopVariantOption1Value').value.trim(),
      option2_name: $('shopVariantOption2Name').value.trim(),
      option2_value: $('shopVariantOption2Value').value.trim(),
      option3_name: $('shopVariantOption3Name').value.trim(),
      option3_value: $('shopVariantOption3Value').value.trim(),
      price_cents: moneyToCents($('shopVariantPrice').value),
      compare_at_price_cents: moneyToCents($('shopVariantComparePrice').value),
      stock_quantity: Number($('shopVariantStock').value || 0),
      track_inventory: $('shopVariantTrackInventory').checked,
      status: $('shopVariantStatus').value,
      sort_order: Number($('shopVariantSortOrder').value || 0)
    };
    const wasEditing = Boolean(editingVariantId);
    try {
      if (wasEditing) {
        await shopRequest(`/variants/${encodeURIComponent(editingVariantId)}`, {
          method: 'PATCH', body: JSON.stringify(payload)
        });
      } else {
        await shopRequest(`/products/${encodeURIComponent(editingProductId)}/variants`, {
          method: 'POST', body: JSON.stringify(payload)
        });
      }
      resetVariantForm();
      await reloadProductDetails();
      showShopMessage(wasEditing ? 'Variante aktualisiert.' : 'Variante hinzugefügt.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteVariant(variant) {
    if (!confirm(`Variante „${variant.variant_name}“ wirklich löschen?`)) return;
    try {
      await shopRequest(`/variants/${encodeURIComponent(variant.id)}`, { method: 'DELETE' });
      await reloadProductDetails();
      showShopMessage('Variante gelöscht.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  async function reloadProductDetails() {
    if (!editingProductId) return;
    const data = await shopRequest(`/products/${encodeURIComponent(editingProductId)}`);
    loadedProductDetails = data.product;
    renderProductImages(loadedProductDetails.images || []);
    renderVariants(loadedProductDetails.variants || []);
  }

  async function saveCategory(event) {
    event.preventDefault();
    const id = $('shopCategoryId').value;
    const button = $('shopCategoryForm').querySelector('button[type="submit"]');
    button.disabled = true;
    const name = $('shopCategoryName').value.trim();
    const payload = {
      name,
      slug: slugify($('shopCategorySlug').value || name),
      description: $('shopCategoryDescription').value.trim(),
      sort_order: Number($('shopCategorySortOrder').value || 0),
      status: $('shopCategoryStatus').value
    };
    try {
      if (id) {
        await shopRequest(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await shopRequest('/categories', { method: 'POST', body: JSON.stringify(payload) });
      }
      closeCategoryEditor();
      await loadShop();
      showShopMessage('Kategorie gespeichert.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function changeProductStatus(product, action) {
    const label = action === 'publish' ? 'veröffentlichen' : 'zurückziehen';
    if (!confirm(`Produkt „${product.name}“ wirklich ${label}?`)) return;
    try {
      await shopRequest(`/products/${encodeURIComponent(product.id)}/${action}`, { method: 'POST', body: '{}' });
      await loadShop();
      showShopMessage(action === 'publish' ? 'Produkt veröffentlicht.' : 'Produkt zurückgezogen.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  async function deleteProduct(product) {
    if (!canShop('shop.products.delete')) return;
    if (!confirm(`Produkt „${product.name}“ endgültig löschen?`)) return;
    try {
      await shopRequest(`/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      await loadShop();
      showShopMessage('Produkt gelöscht.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  async function deleteCategory(category) {
    if (!canShop('shop.categories.manage')) return;
    if (!confirm(`Kategorie „${category.name}“ wirklich löschen?`)) return;
    try {
      await shopRequest(`/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' });
      await loadShop();
      showShopMessage('Kategorie gelöscht.', 'success');
    } catch (error) {
      showShopMessage(getErrorMessage(error), 'error');
    }
  }

  $('shopProductForm')?.addEventListener('submit', saveProduct);
  $('shopCategoryForm')?.addEventListener('submit', saveCategory);
  $('shopVariantForm')?.addEventListener('submit', saveVariant);
  $('createShopProductButton')?.addEventListener('click', () => openProductEditor());
  $('createShopCategoryButton')?.addEventListener('click', () => openCategoryEditor());
  $('closeShopProductEditor')?.addEventListener('click', closeProductEditor);
  $('cancelShopProductEditor')?.addEventListener('click', closeProductEditor);
  $('closeShopCategoryEditor')?.addEventListener('click', closeCategoryEditor);
  $('cancelShopCategoryEditor')?.addEventListener('click', closeCategoryEditor);
  $('uploadShopProductImageButton')?.addEventListener('click', uploadProductImage);
  $('newShopVariantButton')?.addEventListener('click', () => openVariantEditor());
  $('cancelShopVariantEdit')?.addEventListener('click', resetVariantForm);
  $('shopProductStatusFilter')?.addEventListener('change', renderProducts);
  $('shopProductSearch')?.addEventListener('input', renderProducts);

  const previousOpenCmsViewForShop = openCmsView;
  openCmsView = function(viewName) {
    previousOpenCmsViewForShop(viewName);
    if (viewName === 'shop') loadShop();
  };
})();


// ==================================================
// FINAL CMS DASHBOARD INITIALIZATION FIX
// ==================================================
(() => {
  const isOwnerUser = value =>
    value === 1 || value === true || value === "1" || value === "true";

  async function refreshCmsDashboard() {
    const message = document.getElementById("dashboardMessage");
    const currentUser = document.getElementById("currentUser");
    if (!currentUser) return;

    try {
      const data = await apiRequest("/api/admin/me");
      if (!data?.user) {
        throw new Error("Die Benutzerinformationen wurden nicht korrekt geliefert.");
      }

      const user = data.user;
      const permissions = Array.isArray(data.permissions) ? data.permissions : [];
      const owner = isOwnerUser(user.is_owner);
      window.ULTOR_IS_OWNER = owner;
      const roleText = owner ? "OWNER" : "BENUTZER";

      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value ?? "–";
      };

      setText("currentUser", `${user.name || "Unbekannt"} (${user.email || "–"})`);
      setText("roleBadge", roleText);
      setText("sidebarUserName", user.name || "ULTOR User");
      setText("sidebarUserRole", owner ? "Owner" : "CMS-Benutzer");
      setText("userAvatar", (user.name || "U").trim().charAt(0).toUpperCase());
      setText("statUserRole", roleText);
      setText("statPermissionCount", owner ? "Alle" : String(permissions.length));
      setText("accountName", user.name || "–");
      setText("accountEmail", user.email || "–");
      setText("accountRole", roleText);

      const ownerPanelElement = document.getElementById("ownerPanel");
      const standardPanelElement = document.getElementById("standardPanel");
      if (ownerPanelElement) ownerPanelElement.hidden = !owner;
      if (standardPanelElement) standardPanelElement.hidden = owner;

      if (!owner && typeof renderMyPermissions === "function") {
        renderMyPermissions(permissions);
      }
      if (owner && typeof loadUsers === "function") {
        await loadUsers();
      }
      if (message) showMessage(message, "");
    } catch (error) {
      console.error("CMS dashboard initialization failed:", error);
      if (message) showMessage(message, getErrorMessage(error), "error");

      if (/Nicht angemeldet|Zugriff nicht freigegeben|freigegeben/i.test(String(error?.message || ""))) {
        window.location.replace("/admin/login.html");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshCmsDashboard, { once: true });
  } else {
    refreshCmsDashboard();
  }
})();
