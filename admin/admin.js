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

  document.getElementById("newsContent").innerHTML =
  item?.content || "";

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
    document.getElementById("newsContent").innerHTML =
  item?.content || "";
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
  newsUploadStatus.textContent = "Bild wird hochgeladen …";

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

    newsUploadStatus.textContent = "Upload erfolgreich.";
    showMessage(newsMessage, "Bild wurde erfolgreich hochgeladen.", "success");

  } catch (error) {
    newsUploadStatus.textContent = "Upload fehlgeschlagen.";
    showMessage(newsMessage, getErrorMessage(error), "error");

  } finally {
    uploadNewsImage.disabled = false;
  }
});

removeNewsImage?.addEventListener("click", () => {
  newsImageKey.value = "";
  if (newsImageFile) newsImageFile.value = "";

  showNewsImagePreview(null);
  newsUploadStatus.textContent = "Kein Bild ausgewählt.";
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
