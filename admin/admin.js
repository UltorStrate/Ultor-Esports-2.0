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

  const data = await response.json().catch(() => ({}));
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
    await apiRequest(`${API_AUTH}/sign-out`, { method: "POST" });
  } catch (error) {
    console.warn("Logout request failed:", error);
  } finally {
    window.location.replace("/admin/login.html");
  }
});

// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

function openCmsView(viewName) {
  document.querySelectorAll(".cms-view").forEach(view => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  const title = document.getElementById("pageTitle");
  const activeButton = document.querySelector(`[data-view="${viewName}"]`);

  if (title && activeButton) {
    title.textContent = activeButton.textContent.trim();
  }
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    openCmsView(button.dataset.view);
  });
});

loadDashboard();
// Mobile Navigation

const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.querySelector(".sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

sidebarToggle?.addEventListener("click", () => {
  sidebar?.classList.toggle("open");
  sidebarOverlay?.classList.toggle("active");
});

sidebarOverlay?.addEventListener("click", () => {
  sidebar?.classList.remove("open");
  sidebarOverlay?.classList.remove("active");
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    openCmsView(button.dataset.view);
    sidebar?.classList.remove("open");
    sidebarOverlay?.classList.remove("active");
  });
});

// Benutzerinformationen im neuen Dashboard anzeigen

loadDashboard = async function () {
  if (!document.getElementById("currentUser")) return;

  try {
    const data = await apiRequest(`${API_ADMIN}/me`);
    const user = data.user || {};

    const isOwner =
      user.is_owner === 1 ||
      user.is_owner === true ||
      user.is_owner === "1";

    const currentUser = document.getElementById("currentUser");
    const roleBadge = document.getElementById("roleBadge");
    const sidebarUserName = document.getElementById("sidebarUserName");
    const sidebarUserRole = document.getElementById("sidebarUserRole");
    const userAvatar = document.getElementById("userAvatar");

    if (currentUser) {
      currentUser.textContent = `${user.name || "Unbekannt"} (${user.email || ""})`;
    }

    if (roleBadge) {
      roleBadge.textContent = isOwner ? "OWNER" : "CMS-BENUTZER";
    }

    if (sidebarUserName) {
      sidebarUserName.textContent = user.name || "Unbekannt";
    }

    if (sidebarUserRole) {
      sidebarUserRole.textContent = isOwner ? "Owner" : "CMS-Benutzer";
    }

    if (userAvatar) {
      userAvatar.textContent = (user.name || "U").charAt(0).toUpperCase();
    }

    if (ownerPanel) ownerPanel.hidden = !isOwner;
    if (standardPanel) standardPanel.hidden = isOwner;

    if (isOwner) {
      await loadUsers();
    } else {
      renderMyPermissions(data.permissions || []);
    }

  } catch (error) {
    showMessage(dashboardMessage, getErrorMessage(error), "error");

    if (/Nicht angemeldet|freigegeben|Zugriff verweigert/i.test(error.message)) {
      window.location.href = "/admin/login.html";
    }
  }
};

// =========================================
// ULTOR CMS – NEWS MANAGEMENT
// =========================================

let newsItems = [];
let editingNewsId = null;
let newsPermissions = [];

const newsList = document.getElementById("newsList");
const newsEditor = document.getElementById("newsEditor");
const newsForm = document.getElementById("newsForm");
const newsMessage = document.getElementById("newsMessage");

function newsCan(permission) {
  return newsPermissions.includes("*") ||
    newsPermissions.includes(permission);
}

function newsStatusLabel(status) {
  const labels = {
    draft: "Entwurf",
    published: "Veröffentlicht",
    archived: "Archiviert"
  };

  return labels[status] || status;
}

function newsButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

async function loadNews() {
  if (!newsList) return;

  newsList.replaceChildren(
    createElement("p", "muted", "News werden geladen …")
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

      details.append(
        createElement("h3", "", item.title),
        createElement(
          "p",
          "news-meta",
          `${newsStatusLabel(item.status)} · ${item.category || "Allgemein"} · ${item.created_at || ""}`
        )
      );

      if (item.excerpt) {
        details.append(
          createElement("p", "news-excerpt", item.excerpt)
        );
      }

      const actions = createElement("div", "news-actions");

      if (newsCan("news.edit")) {
        actions.append(
          newsButton(
            "Bearbeiten",
            "secondary-button",
            () => openNewsEditor(item)
          )
        );
      }

      if (newsCan("news.publish") && item.status !== "published") {
        actions.append(
          newsButton(
            "Veröffentlichen",
            "primary-button",
            () => changeNewsStatus(item.id, "publish")
          )
        );
      }

      if (newsCan("news.publish") && item.status === "published") {
        actions.append(
          newsButton(
            "Archivieren",
            "secondary-button",
            () => changeNewsStatus(item.id, "archive")
          )
        );
      }

      if (newsCan("news.delete")) {
        actions.append(
          newsButton(
            "Löschen",
            "danger-button",
            () => deleteNews(item.id)
          )
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
  document.getElementById("newsSlug").value = item?.slug || "";
  document.getElementById("newsExcerpt").value = item?.excerpt || "";
  document.getElementById("newsContent").value = item?.content || "";
  document.getElementById("newsCategory").value = item?.category || "";
  document.getElementById("newsImageKey").value = item?.image_key || "";
  document.getElementById("newsStatus").value = item?.status || "draft";

  showNewsImagePreview(item?.image_key || "");

  newsEditor.hidden = false;
  newsEditor.scrollIntoView({ behavior: "smooth" });
}

function closeNewsEditor() {
  newsEditor.hidden = true;
  newsForm.reset();
  editingNewsId = null;
  showNewsImagePreview("");
}

newsForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = newsForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const body = {
    title: document.getElementById("newsTitle").value.trim(),
    slug: document.getElementById("newsSlug").value.trim(),
    excerpt: document.getElementById("newsExcerpt").value.trim(),
    content: document.getElementById("newsContent").value.trim(),
    category: document.getElementById("newsCategory").value.trim(),
    image_key: document.getElementById("newsImageKey").value.trim() || null,
    status: document.getElementById("newsStatus").value
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

      showMessage(newsMessage, "Beitrag wurde erstellt.", "success");
    }

    closeNewsEditor();
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  } finally {
    submitButton.disabled = false;
  }
});

async function changeNewsStatus(id, action) {
  const labels = {
    publish: "veröffentlichen",
    archive: "archivieren"
  };

  if (!window.confirm(`Möchtest du diesen Beitrag ${labels[action]}?`)) {
    return;
  }

  try {
    await apiRequest(`/api/admin/news/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      body: "{}"
    });

    showMessage(newsMessage, `Beitrag wurde ${labels[action]}.`, "success");
    await loadNews();
  } catch (error) {
    showMessage(newsMessage, getErrorMessage(error), "error");
  }
}

async function deleteNews(id) {
  if (!window.confirm("Möchtest du diesen Beitrag endgültig löschen?")) {
    return;
  }

  try {
    await apiRequest(`/api/admin/news/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    showMessage(newsMessage, "Beitrag wurde gelöscht.", "success");
    await loadNews();
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

loadDashboard();

// --------------------------------------------------
// NEWS-BILDER: Upload nach R2 über die vorhandene Admin-API
// --------------------------------------------------

const newsImageFile = document.getElementById("newsImageFile");
const uploadNewsImageButton = document.getElementById("uploadNewsImage");
const newsImageKeyInput = document.getElementById("newsImageKey");
const newsImagePreview = document.getElementById("newsImagePreview");
const newsImagePreviewImg = document.getElementById("newsImagePreviewImg");
const newsUploadStatus = document.getElementById("newsUploadStatus");

function showNewsImagePreview(key) {
  if (!newsImagePreview || !newsImagePreviewImg) return;

  if (!key) {
    newsImagePreview.hidden = true;
    newsImagePreviewImg.removeAttribute("src");
    return;
  }

  newsImagePreviewImg.src =
    `/media/${String(key).split("/").map(encodeURIComponent).join("/")}`;

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
  formData.append("folder", "news");

  uploadNewsImageButton.disabled = true;

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
      throw new Error(
        data.error || data.message ||
        `Upload fehlgeschlagen (${response.status})`
      );
    }

    if (!data.key) {
      throw new Error("Der Server hat keinen Bildschlüssel zurückgegeben.");
    }

    newsImageKeyInput.value = data.key;
    showNewsImagePreview(data.key);

    if (newsUploadStatus) {
      newsUploadStatus.textContent = "Upload erfolgreich.";
    }

    showMessage(newsMessage, "Bild hochgeladen. Speichere anschließend den Beitrag.", "success");

  } catch (error) {
    if (newsUploadStatus) {
      newsUploadStatus.textContent = "Upload fehlgeschlagen.";
    }

    showMessage(newsMessage, getErrorMessage(error), "error");

  } finally {
    uploadNewsImageButton.disabled = false;
  }
});

removeNewsImageButton?.addEventListener("click", () => {
  newsImageKeyInput.value = "";

  if (newsImageFile) {
    newsImageFile.value = "";
  }

  showNewsImagePreview("");

  if (newsUploadStatus) {
    newsUploadStatus.textContent = "Kein Bild ausgewählt.";
  }
});

newsImageKeyInput?.addEventListener("input", () => {
  showNewsImagePreview(newsImageKeyInput.value.trim());
});
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
      partnerPermissions = data.permissions || [];

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
// ULTOR SHOP CMS – PRODUKTE, KATEGORIEN UND VARIANTEN
// ==================================================
(() => {
  const $ = id => document.getElementById(id);
  const message = $('shopMessage');
  const productsList = $('shopProductsList');
  const categoriesList = $('shopCategoriesList');
  const productEditor = $('shopProductEditor');
  const categoryEditor = $('shopCategoryEditor');
  let shopPermissions = [];
  let shopProducts = [];
  let shopCategories = [];
  let editingProductId = null;

  const canShop = permission => shopPermissions.includes('*') || shopPermissions.includes(permission);
  const moneyToCents = value => value === '' ? null : Math.round(Number(value) * 100);
  const centsToMoney = value => value == null ? '' : (Number(value) / 100).toFixed(2);
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const showShopMessage = (text, type='') => showMessage(message, text, type);

  async function shopRequest(path, options={}) {
    return apiRequest(`/api/admin/shop${path}`, options);
  }

  function closeProductEditor() {
    productEditor.hidden = true;
    $('shopProductForm').reset();
    $('shopProductId').value = '';
    $('shopVariantEditor').hidden = true;
    editingProductId = null;
  }

  function closeCategoryEditor() {
    categoryEditor.hidden = true;
    $('shopCategoryForm').reset();
    $('shopCategoryId').value = '';
  }

  function renderCategoryChoices(selected=[]) {
    const container = $('shopProductCategoryChoices');
    container.replaceChildren();
    if (!shopCategories.length) {
      container.textContent = 'Lege zuerst mindestens eine aktive Kategorie an.';
      return;
    }
    shopCategories.filter(category => category.status === 'active').forEach(category => {
      const label = document.createElement('label');
      label.className = 'shop-category-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.name = 'shopCategoryIds'; checkbox.value = category.id;
      checkbox.checked = selected.includes(category.id);
      label.append(checkbox, document.createTextNode(category.name));
      container.append(label);
    });
  }

  function renderProducts() {
    if (!productsList) return;
    productsList.replaceChildren();
    const filter = $('shopProductStatusFilter')?.value || '';
    const filtered = shopProducts.filter(product => !filter || product.status === filter);
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className='muted';
      empty.textContent = 'Noch keine Produkte in diesem Bereich.'; productsList.append(empty); return;
    }
    filtered.forEach(product => {
      const card = document.createElement('article'); card.className='news-card';
      const details = document.createElement('div'); details.className='news-card-details';
      const title = document.createElement('h3'); title.textContent=product.name;
      const meta = document.createElement('p'); meta.className='news-meta';
      meta.textContent = `${product.price_cents == null ? 'Preis folgt' : new Intl.NumberFormat('de-DE',{style:'currency',currency:product.currency||'EUR'}).format(product.price_cents/100)} · ${product.slug || ''}`;
      const status = document.createElement('span'); status.className=`shop-status ${product.status}`; status.textContent=product.status;
      details.append(title,meta,status);
      if (product.short_description) { const desc=document.createElement('p'); desc.className='news-excerpt'; desc.textContent=product.short_description; details.append(desc); }
      const actions=document.createElement('div'); actions.className='news-actions';
      if (canShop('shop.products.edit')) actions.append(actionButton('Bearbeiten','secondary-button',()=>openProductEditor(product)));
      if (canShop('shop.products.publish')) actions.append(actionButton(product.status==='published'?'Zurückziehen':'Veröffentlichen','secondary-button',()=>togglePublish(product)));
      if (canShop('shop.products.delete')) actions.append(actionButton('Löschen','danger-button',()=>deleteProduct(product)));
      card.append(details,actions); productsList.append(card);
    });
  }

  function actionButton(label, className, handler) {
    const button=document.createElement('button'); button.type='button'; button.className=className; button.textContent=label;
    button.addEventListener('click',handler); return button;
  }

  function renderCategories() {
    if (!categoriesList) return;
    categoriesList.replaceChildren();
    if (!shopCategories.length) { const p=document.createElement('p'); p.className='muted'; p.textContent='Noch keine Kategorien vorhanden.'; categoriesList.append(p); return; }
    shopCategories.forEach(category => {
      const card=document.createElement('article'); card.className='news-card';
      const details=document.createElement('div'); details.className='news-card-details';
      const title=document.createElement('h3'); title.textContent=category.name;
      const meta=document.createElement('p'); meta.className='news-meta';
      meta.textContent=`${category.status} · ${category.slug || ''}`;
      details.append(title,meta);
      if(category.description){const desc=document.createElement('p');desc.className='news-excerpt';desc.textContent=category.description;details.append(desc);}
      const actions=document.createElement('div');actions.className='news-actions';
      if(canShop('shop.categories.manage')) actions.append(actionButton('Bearbeiten','secondary-button',()=>openCategoryEditor(category)));
      if(canShop('shop.categories.manage')) actions.append(actionButton('Löschen','danger-button',()=>deleteCategory(category)));
      card.append(details,actions);categoriesList.append(card);
    });
  }

  async function loadShop() {
    if (!productsList || !categoriesList) return;
    productsList.replaceChildren(Object.assign(document.createElement('p'),{className:'muted',textContent:'Shop wird geladen …'}));
    try {
      const data = await shopRequest('/products');
      shopProducts = data.products || [];
      const categoryData = await shopRequest('/categories');
      shopCategories = categoryData.categories || [];
      renderProducts();
      renderCategories();
    } catch(error) {
      showShopMessage(getErrorMessage(error),'error');
    }
  }

  function openProductEditor(product=null) {
    editingProductId = product?.id || null;
    $('shopProductEditorTitle').textContent = product ? 'Produkt bearbeiten' : 'Neues Produkt';
    $('shopProductId').value = product?.id || '';
    $('shopProductName').value = product?.name || '';
    $('shopProductSlug').value = product?.slug || '';
    $('shopProductShortDescription').value = product?.short_description || '';
    $('shopProductDescription').value = product?.description || '';
    $('shopProductStatus').value = product?.status || 'draft';
    $('shopProductPrice').value = centsToMoney(product?.price_cents);
    $('shopProductComparePrice').value = centsToMoney(product?.compare_at_price_cents);
    $('shopProductSortOrder').value = product?.sort_order ?? 0;
    $('shopProductFeatured').checked = Boolean(product?.is_featured);
    renderCategoryChoices(product?.category_ids || []);
    $('shopVariantEditor').hidden = !product;
    $('shopProductEditor').hidden = false;
    $('shopProductEditor').scrollIntoView({behavior:'smooth'});
  }

  function openCategoryEditor(category=null) {
    $('shopCategoryId').value = category?.id || '';
    $('shopCategoryName').value = category?.name || '';
    $('shopCategoryDescription').value = category?.description || '';
    $('shopCategorySortOrder').value = category?.sort_order ?? 0;
    $('shopCategoryEditorTitle').textContent = category ? 'Kategorie bearbeiten' : 'Neue Kategorie';
    categoryEditor.hidden = false;
    categoryEditor.scrollIntoView({behavior:'smooth'});
  }

  $('shopProductForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const category_ids = Array.from(document.querySelectorAll('input[name="shopCategoryIds"]:checked')).map(input=>input.value);
    const payload={name:$('shopProductName').value.trim(),slug:$('shopProductSlug').value.trim(),short_description:$('shopProductShortDescription').value.trim(),description:$('shopProductDescription').value.trim(),status:$('shopProductStatus').value,price_cents:moneyToCents($('shopProductPrice').value),compare_at_price_cents:moneyToCents($('shopProductComparePrice').value),sort_order:Number($('shopProductSortOrder').value||0),is_featured:$('shopProductFeatured').checked};
    const button=$('shopProductForm').querySelector('button[type="submit"]'); button.disabled=true;
    try {
      let productId=editingProductId;
      if (productId) await shopRequest(`/products/${encodeURIComponent(productId)}`,{method:'PATCH',body:JSON.stringify(payload)});
      else { const created=await shopRequest('/products',{method:'POST',body:JSON.stringify(payload)}); productId=created.id; }
      // Beim Erstellen werden Kategorien direkt zugewiesen. Beim Bearbeiten lassen wir bestehende Zuordnungen unverändert, da die aktuelle Admin-GET-API diese nicht mitliefert.
      if (!editingProductId) await shopRequest(`/products/${encodeURIComponent(productId)}/categories`,{method:'PUT',body:JSON.stringify({category_ids})});
      showShopMessage('Produkt gespeichert. Es befindet sich zunächst als Entwurf im Shop.','success');
      closeProductEditor(); await loadShop();
    } catch(error) { showShopMessage(getErrorMessage(error),'error'); }
    finally { button.disabled=false; }
  });

  $('shopCategoryForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const id=$('shopCategoryId').value;
    const payload={name:$('shopCategoryName').value.trim(),description:$('shopCategoryDescription').value.trim(),sort_order:Number($('shopCategorySortOrder').value||0),status:'active'};
    const button=$('shopCategoryForm').querySelector('button[type="submit"]'); button.disabled=true;
    try {
      if(id) await shopRequest(`/categories/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});
      else await shopRequest('/categories',{method:'POST',body:JSON.stringify(payload)});
      closeCategoryEditor(); await loadShop(); showShopMessage('Kategorie gespeichert.','success');
    } catch(error) { showShopMessage(getErrorMessage(error),'error'); }
    finally { button.disabled=false; }
  });

  $('shopVariantForm')?.addEventListener('submit', async event => {
    event.preventDefault(); if(!editingProductId) return;
    const payload={variant_name:$('shopVariantName').value.trim(),sku:$('shopVariantSku').value.trim(),stock_quantity:Number($('shopVariantStock').value||0),track_inventory:$('shopVariantTrackInventory').checked,status:'active'};
    try { await shopRequest(`/products/${encodeURIComponent(editingProductId)}/variants`,{method:'POST',body:JSON.stringify(payload)}); $('shopVariantForm').reset(); $('shopVariantStock').value='0'; $('shopVariantTrackInventory').checked=true; showShopMessage('Variante wurde hinzugefügt.','success'); }
    catch(error){showShopMessage(getErrorMessage(error),'error');}
  });

  async function togglePublish(product) {
    const action=product.status==='published'?'unpublish':'publish';
    try { await shopRequest(`/products/${encodeURIComponent(product.id)}/${action}`,{method:'POST',body:'{}'}); await loadShop(); showShopMessage(action==='publish'?'Produkt veröffentlicht.':'Produkt zurückgezogen.','success'); }
    catch(error){showShopMessage(getErrorMessage(error),'error');}
  }
  async function deleteProduct(product) {
    if(!confirm(`Produkt „${product.name}“ wirklich löschen?`)) return;
    try { await shopRequest(`/products/${encodeURIComponent(product.id)}`,{method:'DELETE'}); await loadShop(); showShopMessage('Produkt gelöscht.','success'); }
    catch(error){showShopMessage(getErrorMessage(error),'error');}
  }
  async function deleteCategory(category) {
    if(!confirm(`Kategorie „${category.name}“ wirklich löschen?`)) return;
    try { await shopRequest(`/categories/${encodeURIComponent(category.id)}`,{method:'DELETE'}); await loadShop(); showShopMessage('Kategorie gelöscht.','success'); }
    catch(error){showShopMessage(getErrorMessage(error),'error');}
  }

  $('createShopProductButton')?.addEventListener('click',()=>openProductEditor());
  $('createShopCategoryButton')?.addEventListener('click',()=>openCategoryEditor());
  $('closeShopProductEditor')?.addEventListener('click',closeProductEditor);
  $('cancelShopProductEditor')?.addEventListener('click',closeProductEditor);
  $('closeShopCategoryEditor')?.addEventListener('click',closeCategoryEditor);
  $('cancelShopCategoryEditor')?.addEventListener('click',closeCategoryEditor);
  $('shopProductStatusFilter')?.addEventListener('change',renderProducts);

  const previousOpenCmsViewForShop = openCmsView;
  openCmsView = function(viewName) {
    previousOpenCmsViewForShop(viewName);
    if(viewName==='shop') loadShop();
  };
})();


// ==================================================
// FINAL CMS DASHBOARD INITIALIZATION FIX
// ==================================================
(() => {
  const isOwnerUser = value =>
    value === 1 || value === true || value === "1";

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
