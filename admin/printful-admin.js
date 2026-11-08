(() => {
  "use strict";

  const API = "/api/admin/shop/printful";
  let initialized = false;
  let categoriesCache = null;

  const styles = `
    #printfulPanel[hidden] { display: none !important; }
    #printfulPanel { margin-top: 18px; }
    #printfulPanel .pf-head { display:flex; gap:16px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
    #printfulPanel .pf-actions, #printfulPanel .pf-row-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    #printfulPanel .pf-status { margin:8px 0 0; color:var(--muted, #9ca3af); font-size:13px; }
    #printfulPanel .pf-message { margin:14px 0; padding:10px 12px; border-radius:8px; display:none; }
    #printfulPanel .pf-message.show { display:block; }
    #printfulPanel .pf-message.error { color:#fecaca; background:rgba(220,38,38,.12); }
    #printfulPanel .pf-message.success { color:#bbf7d0; background:rgba(22,163,74,.12); }
    #printfulPanel .pf-list { display:grid; gap:10px; margin-top:16px; }
    #printfulPanel .pf-product { border:1px solid var(--border, rgba(255,255,255,.1)); border-radius:10px; padding:14px; }
    #printfulPanel .pf-product-top { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
    #printfulPanel .pf-product-name { margin:0 0 5px; font-weight:650; }
    #printfulPanel .pf-meta { margin:0; color:var(--muted, #9ca3af); font-size:13px; }
    #printfulPanel .pf-import-form { display:flex; gap:10px; align-items:end; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px solid var(--border, rgba(255,255,255,.1)); }
    #printfulPanel .pf-field { display:grid; gap:6px; min-width:160px; flex:1; }
    #printfulPanel .pf-field label { font-size:12px; color:var(--muted, #9ca3af); }
    #printfulPanel .pf-field input, #printfulPanel .pf-field select { width:100%; min-height:40px; padding:8px 10px; border:1px solid var(--border, rgba(255,255,255,.15)); border-radius:7px; background:var(--input-bg, #111827); color:inherit; }
    #printfulPanel .pf-note { color:var(--muted, #9ca3af); font-size:12px; margin:10px 0 0; }
    #printfulPanel .pf-imported { color:#86efac; font-size:12px; font-weight:600; }
    #printfulPanel [hidden] { display:none !important; }
  `;

  function addStyles() {
    if (document.getElementById("printfulAdminStyles")) return;
    const style = document.createElement("style");
    style.id = "printfulAdminStyles";
    style.textContent = styles;
    document.head.append(style);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error("Die Shop-API hat keine gültige JSON-Antwort geliefert."); }

    if (!response.ok) {
      throw new Error(data.error || data.message || ("HTTP " + response.status));
    }
    return data;
  }

  function showMessage(message, type = "success") {
    const box = document.getElementById("printfulMessage");
    if (!box) return;
    box.textContent = message;
    box.className = "pf-message show " + type;
  }

  function clearMessage() {
    const box = document.getElementById("printfulMessage");
    if (!box) return;
    box.textContent = "";
    box.className = "pf-message";
  }

  function makeButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function ensurePanel() {
    const view = document.getElementById("view-shop");
    const heading = view?.querySelector(".shop-page-heading");
    const actions = heading?.querySelector(".shop-heading-actions");
    if (!view || !heading || !actions) return false;

    if (!document.getElementById("printfulOpenButton")) {
      const openButton = makeButton("Printful importieren", "secondary-button", async () => {
        const panel = document.getElementById("printfulPanel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) await loadPrintful();
      });
      openButton.id = "printfulOpenButton";
      actions.append(openButton);
    }

    if (!document.getElementById("printfulPanel")) {
      const panel = document.createElement("section");
      panel.id = "printfulPanel";
      panel.className = "content-panel";
      panel.hidden = true;
      panel.innerHTML = `
        <div class="pf-head">
          <div>
            <h2 style="margin:0">Printful – Produktimport</h2>
            <p class="pf-status" id="printfulStatus">Verbindung wird geprüft …</p>
          </div>
          <div class="pf-actions">
            <button type="button" class="secondary-button" id="printfulRefreshButton">Aktualisieren</button>
            <button type="button" class="secondary-button" id="printfulCloseButton">Schließen</button>
          </div>
        </div>
        <div id="printfulMessage" class="pf-message" role="status" aria-live="polite"></div>
        <div id="printfulProductsList" class="pf-list">
          <p class="muted">Printful-Produkte werden geladen …</p>
        </div>
        <p class="pf-note">Der Import erstellt in ULTOR zunächst nur einen Entwurf. Verkaufspreis und Kategorie legst du hier fest; Checkout, Zahlung und automatische Bestellübermittlung sind davon getrennte nächste Schritte.</p>
      `;
      heading.insertAdjacentElement("afterend", panel);

      document.getElementById("printfulCloseButton")?.addEventListener("click", () => {
        panel.hidden = true;
      });
      document.getElementById("printfulRefreshButton")?.addEventListener("click", loadPrintful);
    }

    return true;
  }

  async function loadCategories() {
    if (categoriesCache) return categoriesCache;
    const data = await api("/api/admin/shop/categories");
    categoriesCache = Array.isArray(data.categories) ? data.categories : [];
    return categoriesCache;
  }

  function numberOfVariants(product) {
    if (Array.isArray(product.variants)) return product.variants.length;
    const count = Number(product.variants);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function renderProducts(products) {
    const list = document.getElementById("printfulProductsList");
    if (!list) return;
    list.replaceChildren();

    if (!products.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "In deinem Printful-Store wurden keine Produkte gefunden.";
      list.append(empty);
      return;
    }

    products.forEach(product => {
      const row = document.createElement("article");
      row.className = "pf-product";

      const top = document.createElement("div");
      top.className = "pf-product-top";

      const info = document.createElement("div");
      const name = document.createElement("p");
      name.className = "pf-product-name";
      name.textContent = product.name || ("Printful-Produkt #" + product.id);

      const meta = document.createElement("p");
      meta.className = "pf-meta";
      const count = numberOfVariants(product);
      meta.textContent = "Printful-ID: " + product.id +
        (count === null ? "" : " · " + count + " Varianten");

      info.append(name, meta);
      top.append(info);

      const action = document.createElement("div");
      action.className = "pf-row-actions";
      if (product.imported) {
        const imported = document.createElement("span");
        imported.className = "pf-imported";
        imported.textContent = "Bereits importiert";
        action.append(imported);
      } else {
        action.append(makeButton("Import vorbereiten", "secondary-button", () => {
          showImportForm(row, product);
        }));
      }

      top.append(action);
      row.append(top);

      const formHost = document.createElement("div");
      formHost.className = "pf-form-host";
      row.append(formHost);
      list.append(row);
    });
  }

  async function showImportForm(row, product) {
    const host = row.querySelector(".pf-form-host");
    if (!host) return;

    host.replaceChildren();
    const form = document.createElement("form");
    form.className = "pf-import-form";

    const nameField = document.createElement("div");
    nameField.className = "pf-field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Produktname im ULTOR-Shop";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 160;
    nameInput.required = true;
    nameInput.value = product.name || "";
    nameField.append(nameLabel, nameInput);

    const priceField = document.createElement("div");
    priceField.className = "pf-field";
    const priceLabel = document.createElement("label");
    priceLabel.textContent = "ULTOR-Verkaufspreis (€)";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0.01";
    priceInput.max = "1000000";
    priceInput.step = "0.01";
    priceInput.placeholder = "z. B. 49,99";
    priceInput.required = true;
    priceField.append(priceLabel, priceInput);

    const categoryField = document.createElement("div");
    categoryField.className = "pf-field";
    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "Kategorie";
    const categorySelect = document.createElement("select");
    const noCategory = document.createElement("option");
    noCategory.value = "";
    noCategory.textContent = "Keine Kategorie";
    categorySelect.append(noCategory);
    categoryField.append(categoryLabel, categorySelect);

    const buttons = document.createElement("div");
    buttons.className = "pf-row-actions";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-button";
    submit.textContent = "Als Entwurf importieren";
    const cancel = makeButton("Abbrechen", "secondary-button", () => host.replaceChildren());
    buttons.append(submit, cancel);

    form.append(nameField, priceField, categoryField, buttons);
    host.append(form);

    try {
      const categories = await loadCategories();
      categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.append(option);
      });
    } catch (error) {
      showMessage("Kategorien konnten nicht geladen werden: " + error.message, "error");
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      clearMessage();

      const normalizedPrice = priceInput.value.trim().replace(",", ".");
      const price = Number(normalizedPrice);
      if (!Number.isFinite(price) || price <= 0) {
        showMessage("Bitte gib einen gültigen Verkaufspreis ein.", "error");
        return;
      }

      submit.disabled = true;
      submit.textContent = "Import läuft …";
      try {
        const result = await api(API + "/products/" + encodeURIComponent(product.id) + "/import", {
          method: "POST",
          body: JSON.stringify({
            name: nameInput.value.trim(),
            price_cents: Math.round(price * 100),
            category_id: categorySelect.value || null
          })
        });
        showMessage(result.message || "Produkt wurde importiert.", "success");
        host.replaceChildren();
        await loadPrintful();
      } catch (error) {
        showMessage("Import fehlgeschlagen: " + error.message, "error");
        submit.disabled = false;
        submit.textContent = "Als Entwurf importieren";
      }
    });
  }

  async function loadPrintful() {
    if (!initialized) return;
    clearMessage();

    const status = document.getElementById("printfulStatus");
    const list = document.getElementById("printfulProductsList");
    if (status) status.textContent = "Verbindung wird geprüft …";
    if (list) {
      list.replaceChildren();
      const loading = document.createElement("p");
      loading.className = "muted";
      loading.textContent = "Produkte werden geladen …";
      list.append(loading);
    }

    try {
      const connection = await api(API + "/status");
      if (!connection.connected) throw new Error(connection.error || "Printful ist nicht verbunden.");
      if (!connection.store) {
        if (status) status.textContent = "Token gültig, aber kein Printful-Store zugeordnet.";
        if (list) list.replaceChildren();
        return;
      }

      if (status) {
        status.textContent = "Verbunden mit „" + connection.store.name +
          "“ (Store-ID " + connection.store.id + ").";
      }

      const data = await api(API + "/products");
      renderProducts(Array.isArray(data.products) ? data.products : []);
    } catch (error) {
      if (status) status.textContent = "Printful-Verbindung konnte nicht hergestellt werden.";
      showMessage(error.message, "error");
      if (list) list.replaceChildren();
    }
  }

  function init() {
    if (initialized) return;
    if (!ensurePanel()) return;
    addStyles();
    initialized = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
