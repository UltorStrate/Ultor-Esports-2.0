(() => {
  "use strict";

  const root = document.getElementById("ultorOrdersPanel");
  if (!root) return;

  const $ = id => document.getElementById(id);
  const list = $("ultorOrdersList");
  const message = $("ultorOrdersMessage");
  const detail = $("ultorOrderDetail");
  const detailBody = $("ultorOrderDetailBody");
  const noteForm = $("ultorOrderNoteForm");
  const noteInput = $("ultorOrderInternalNote");
  let selectedOrderId = null;
  let canManage = false;
  let searchTimer = null;

  const labels = {
    pending_payment: "Zahlung ausstehend",
    confirmed: "Bestätigt",
    processing: "In Bearbeitung",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
    on_hold: "Zurückgestellt",
    unpaid: "Nicht bezahlt",
    pending: "Ausstehend",
    paid: "Bezahlt",
    failed: "Fehlgeschlagen",
    refunded: "Erstattet",
    partially_refunded: "Teilweise erstattet",
    unfulfilled: "Nicht erfüllt",
    queued: "Warteschlange",
    submitted: "An Printful übermittelt",
    in_production: "In Produktion",
    shipped: "Versendet",
    delivered: "Zugestellt",
    not_submitted: "Noch nicht übermittelt"
  };

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "message" + (type ? " " + type : "");
  }
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function money(cents, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format((Number(cents) || 0) / 100);
  }
  function date(value) {
    if (!value) return "–";
    const normalized = String(value).includes("T") ? value : String(value).replace(" ", "T") + "Z";
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  }
  function label(value) { return labels[value] || value || "–"; }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "Accept": "application/json", ...(options.headers || {}) }
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Ungültige Serverantwort."); }
    if (!response.ok) throw new Error(data.error || data.message || "Fehler " + response.status);
    return data;
  }

  async function loadOrders() {
    list.replaceChildren(node("p", "Bestellungen werden geladen …", "muted"));
    setMessage("");
    const params = new URLSearchParams({ limit: "100" });
    const q = $("ultorOrdersSearch").value.trim();
    const status = $("ultorOrdersStatus").value;
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    try {
      const data = await api("/api/admin/shop/orders?" + params.toString());
      list.replaceChildren();
      if (!data.orders?.length) {
        list.append(node("p", "Keine Bestellungen gefunden.", "muted"));
        return;
      }
      data.orders.forEach(order => {
        const row = node("article", null, "ultor-order-row");
        const identity = node("div");
        identity.append(node("strong", order.order_number), node("small", date(order.created_at)));
        const customer = node("div");
        customer.append(node("strong", order.customer_name), node("small", order.customer_email));
        const total = node("div");
        total.append(node("strong", money(order.total_cents, order.currency)), node("small", (order.item_count || 0) + " Position(en)"));
        const statusBox = node("div");
        statusBox.append(node("span", label(order.order_status), "ultor-order-pill"));
        statusBox.append(node("small", label(order.payment_status) + " · " + label(order.fulfillment_status)));
        const button = node("button", "Details", "secondary-button");
        button.type = "button";
        button.addEventListener("click", () => loadOrderDetail(order.id));
        row.append(identity, customer, total, statusBox, button);
        list.append(row);
      });
    } catch (error) {
      list.replaceChildren(node("p", "Bestellungen konnten nicht geladen werden.", "muted"));
      setMessage(error.message, "error");
    }
  }

  function detailCard(title, value) {
    const card = node("div", null, "ultor-order-detail-card");
    card.append(node("span", title), node("strong", value || "–"));
    return card;
  }

  async function loadOrderDetail(id) {
    try {
      const data = await api("/api/admin/shop/orders/" + encodeURIComponent(id));
      const order = data.order;
      selectedOrderId = id;
      $("ultorOrderDetailTitle").textContent = order.order_number;
      detailBody.replaceChildren();
      const grid = node("div", null, "ultor-order-detail-grid");
      const address = [order.shipping_name, order.shipping_company, order.shipping_address1, order.shipping_address2, [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(" "), order.shipping_state, order.shipping_country_code, order.shipping_phone].filter(Boolean).join("\n");
      const contact = [order.customer_name, order.customer_email, order.customer_phone].filter(Boolean).join("\n");
      grid.append(
        detailCard("Kunde", contact),
        detailCard("Lieferadresse", address),
        detailCard("Zahlungsstatus", label(order.payment_status)),
        detailCard("Versand / Fulfillment", label(order.fulfillment_status)),
        detailCard("Bestellstatus", label(order.order_status)),
        detailCard("Bestelldatum", date(order.created_at))
      );
      detailBody.append(grid);
      detailBody.append(node("h4", "Bestellpositionen"));
      const table = node("table", null, "ultor-order-items");
      const thead = node("thead"), header = node("tr");
      ["Produkt", "Variante / SKU", "Menge", "Einzelpreis", "Gesamt"].forEach(t => header.append(node("th", t)));
      thead.append(header); table.append(thead);
      const tbody = node("tbody");
      (data.items || []).forEach(item => {
        const tr = node("tr");
        [item.product_name, [item.variant_name, item.sku].filter(Boolean).join(" · ") || "–", String(item.quantity), money(item.unit_price_cents, order.currency), money(item.line_total_cents, order.currency)].forEach(v => tr.append(node("td", v)));
        tbody.append(tr);
      });
      table.append(tbody); detailBody.append(table);
      const totals = node("div", null, "ultor-order-detail-grid");
      totals.append(detailCard("Zwischensumme", money(order.subtotal_cents, order.currency)), detailCard("Versand", money(order.shipping_cents, order.currency)), detailCard("Rabatt", money(order.discount_cents, order.currency)), detailCard("Gesamt", money(order.total_cents, order.currency)));
      detailBody.append(totals);
      if (order.customer_note) {
        detailBody.append(node("h4", "Kundenhinweis"), node("p", order.customer_note));
      }
      if (order.internal_note) noteInput.value = order.internal_note;
      else noteInput.value = "";
      detailBody.append(node("h4", "Ereignisprotokoll"));
      const events = node("div", null, "ultor-order-events");
      (data.events || []).forEach(event => {
        const item = node("div", null, "ultor-order-event");
        item.append(node("strong", event.message), node("small", label(event.event_type) + " · " + date(event.created_at)));
        events.append(item);
      });
      if (!data.events?.length) events.append(node("p", "Noch keine Ereignisse.", "muted"));
      detailBody.append(events);

      if (canManage) {
        detailBody.append(node("h4", "Bestellung verwalten"));
        const actions = node("div", null, "ultor-order-admin-actions");
        const cancelButton = node("button", "Bestellung stornieren", "secondary-button");
        cancelButton.type = "button";
        cancelButton.disabled = order.order_status === "cancelled" || ["paid", "partially_refunded"].includes(order.payment_status) ||
          Boolean(order.printful_order_id) || ["submitted", "in_production", "shipped", "delivered"].includes(order.fulfillment_status);
        cancelButton.addEventListener("click", async () => {
          if (!confirm("Bestellung " + order.order_number + " wirklich stornieren?")) return;
          const reason = prompt("Stornierungsgrund (optional):") || "";
          try {
            await api("/api/admin/shop/orders/" + encodeURIComponent(id) + "/cancel", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason })
            });
            setMessage("Bestellung wurde storniert.", "success");
            await loadOrders();
            await loadOrderDetail(id);
          } catch (error) { setMessage(error.message, "error"); }
        });
        const deleteButton = node("button", "Testbestellung löschen", "danger-button");
        deleteButton.type = "button";
        deleteButton.disabled = order.payment_status !== "unpaid" || Boolean(order.printful_order_id) ||
          order.fulfillment_status !== "unfulfilled" ||
          (data.fulfillment && data.fulfillment.status !== "not_submitted") ||
          !(data.events || []).some(event => event.event_type === "test_order_created");
        deleteButton.addEventListener("click", async () => {
          if (!confirm("Diese Testbestellung und alle zugehörigen Positionen und Ereignisse endgültig löschen?")) return;
          try {
            await api("/api/admin/shop/orders/" + encodeURIComponent(id), { method: "DELETE" });
            detail.hidden = true; selectedOrderId = null;
            setMessage("Testbestellung wurde gelöscht.", "success");
            await loadOrders();
          } catch (error) { setMessage(error.message, "error"); }
        });
        actions.append(cancelButton, deleteButton);
        detailBody.append(actions);
        const hint = node("p", "Löschen ist nur für unbezahlte Testbestellungen ohne übermittelten Printful-Auftrag möglich.", "muted");
        detailBody.append(hint);
      }
      if (data.fulfillment) {
        detailBody.append(node("h4", "Printful-Fulfillment"));
        detailBody.append(node("p", "Status: " + label(data.fulfillment.status) + " · Versuche: " + data.fulfillment.attempt_count));
        if (data.fulfillment.last_error) detailBody.append(node("p", "Letzter Fehler: " + data.fulfillment.last_error));
      }
      noteForm.hidden = !canManage;
      detail.hidden = false;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!selectedOrderId || !canManage) return;
    try {
      await api("/api/admin/shop/orders/" + encodeURIComponent(selectedOrderId) + "/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteInput.value })
      });
      setMessage("Interne Notiz wurde gespeichert.", "success");
      await loadOrderDetail(selectedOrderId);
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  $("ultorOrdersRefresh").addEventListener("click", loadOrders);
  $("ultorOrdersStatus").addEventListener("change", loadOrders);
  $("ultorOrdersSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadOrders, 250);
  });
  $("ultorOrderDetailClose").addEventListener("click", () => {
    detail.hidden = true;
    selectedOrderId = null;
  });
  noteForm.addEventListener("submit", saveNote);

  async function initialize() {
    try {
      const profile = await api("/api/admin/me");
      const permissions = profile.permissions || [];
      const owner = profile.user?.is_owner === 1 || profile.user?.is_owner === true || profile.user?.is_owner === "1";
      canManage = owner || permissions.includes("*") || permissions.includes("shop.orders.manage");
      const canView = owner || permissions.includes("*") || permissions.includes("shop.orders.view");
      const ordersNav = document.querySelector('.nav-item[data-view="orders"]');
      if (ordersNav) ordersNav.hidden = !canView;
      if (!canView) {
        root.hidden = true;
        return;
      }
      await loadOrders();
    } catch (error) {
      setMessage("Bestellverwaltung nicht verfügbar: " + error.message, "error");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
