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
loadDashboard();
