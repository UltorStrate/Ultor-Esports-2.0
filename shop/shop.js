
/* =========================================
   ULTOR ESPORTS - OFFICIAL SHOP
   API, PRODUCTS & PRODUCT DETAILS
   ========================================= */

const SHOP_API = "/api/shop";

let shopProducts = [];
let shopCategories = [];
let activeCategory = null; // Hidden until a category is selected.

/* =========================================
   API
   ========================================= */

async function shopApiRequest(endpoint) {
    const response = await fetch(`${SHOP_API}${endpoint}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`Shop API Fehler: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || "Shop API Anfrage fehlgeschlagen.");
    }

    return data;
}

/* =========================================
   PRODUCT SECTION VISIBILITY
   ========================================= */

function getProductSection() {
    const productGrid = document.getElementById("productGrid");
    return document.querySelector(".shop-products") ||
        document.getElementById("products") ||
        productGrid?.closest("section") ||
        productGrid?.parentElement ||
        null;
}

function setProductSectionVisible(visible) {
    const section = getProductSection();
    if (!section) return;

    if (visible) {
        section.hidden = false;
        section.style.removeProperty("display");
    } else {
        section.hidden = true;
        // Override a possible display:grid/flex declaration from the stylesheet.
        section.style.setProperty("display", "none", "important");
    }
}

/* =========================================
   LOAD SHOP DATA
   ========================================= */

async function loadShopData() {
    setProductSectionVisible(false);

    const productGrid = document.getElementById("productGrid");
    const emptyState = document.getElementById("productEmptyState");

    if (productGrid) {
        productGrid.innerHTML = `
            <div class="shop-loading">
                <span>ULTOR</span>
                <p>Produkte werden geladen ...</p>
            </div>
        `;
    }

    if (emptyState) emptyState.hidden = true;

    try {
        const [productData, categoryData] = await Promise.all([
            shopApiRequest(""),
            shopApiRequest("/categories")
        ]);

        shopProducts = Array.isArray(productData.products)
            ? productData.products
            : [];

        shopCategories = Array.isArray(categoryData.categories)
            ? categoryData.categories
            : [];

        renderShopCategories();
        renderShopProducts();

        console.log("ULTOR Shop geladen:", {
            products: shopProducts.length,
            categories: shopCategories.length
        });

    } catch (error) {
        console.error("Shop konnte nicht geladen werden:", error);

        if (productGrid) productGrid.replaceChildren();

        if (emptyState) {
            emptyState.hidden = false;

            const heading = emptyState.querySelector("h3");
            const paragraph = emptyState.querySelector("p");

            if (heading) heading.textContent = "SHOP NICHT ERREICHBAR.";
            if (paragraph) {
                paragraph.textContent =
                    "Beim Laden des Shops ist ein Fehler aufgetreten. Bitte versuche es später erneut.";
            }
        }
    }
}

/* =========================================
   CATEGORIES
   ========================================= */

function normalizeCategoryToken(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function findCategoryForCard(card, index) {
    const homepageSlots = ["teamwear", "apparel", "accessories", "limited_editions"];
    const requestedSlot = card.dataset.homeSlot || homepageSlots[index];

    // Explicit CMS assignment always wins over name/slug heuristics.
    const assignedCategory = shopCategories.find(category =>
        category.homepage_slot === requestedSlot
    );
    if (assignedCategory) return assignedCategory;

    const heading = card.querySelector("h3");
    const overlay = card.querySelector(".category-overlay-text");
    const rawLabels = [
        card.dataset.category,
        heading?.textContent,
        overlay?.textContent,
        card.getAttribute("aria-label")
    ].filter(Boolean).map(normalizeCategoryToken);

    const aliases = [
        ["teamwear", "teamwear", "teammerch", "jerseys"],
        ["apparel", "apparel", "clothing", "kleidung"],
        ["accessories", "accessories", "accessory", "zubehor"],
        ["limitededitions", "limitededitions", "limitededition", "specials", "special", "limited"]
    ];
    const expected = aliases[index] || [];

    // Prefer exact slug/name matches. This keeps the visual card connected to
    // the intended database category even if category sort order changes.
    const tokens = [...rawLabels, ...expected];
    const match = shopCategories.find(category => {
        const categoryTokens = [category.slug, category.name, category.id]
            .filter(Boolean).map(normalizeCategoryToken);
        return tokens.some(token => token && categoryTokens.includes(token));
    });

    // Legacy fallback only for categories that do not yet have a stored slot.
    const legacyMatch = match && !match.homepage_slot ? match : null;
    if (legacyMatch) return legacyMatch;

    return shopCategories.find(category =>
        !category.homepage_slot && expected.some(token => {
            const categoryTokens = [category.slug, category.name, category.id]
                .filter(Boolean).map(normalizeCategoryToken);
            return categoryTokens.includes(token);
        })
    ) || null;
}

function renderShopCategories() {
    const cards = document.querySelectorAll(".category-card");

    cards.forEach((card, index) => {
        const category = findCategoryForCard(card, index);
        if (!category) {
            card.dataset.category = "";
            card.setAttribute("aria-disabled", "true");
            return;
        }

        const categoryId = category.slug || category.id;
        card.dataset.category = categoryId;
        card.href = "#products";
        card.removeAttribute("aria-disabled");
        card.setAttribute("aria-pressed", String(activeCategory === categoryId));

        const heading = card.querySelector("h3");
        if (heading) heading.textContent = category.name;

        card.onclick = event => {
            event.preventDefault();
            setActiveCategory(categoryId);
            document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
        };
    });
}

function setActiveCategory(categoryId) {
    if (!categoryId) return;

    activeCategory = categoryId;
    setProductSectionVisible(true);

    document.querySelectorAll(".category-card").forEach(card => {
        const isActive = card.dataset.category === activeCategory;

        card.classList.toggle("active", isActive);
        card.setAttribute("aria-pressed", String(isActive));
    });

    renderShopProducts();
}

/* =========================================
   PRODUCT HELPERS
   ========================================= */

function getProductCategories(product) {
    if (!Array.isArray(product.categories)) return [];

    return product.categories.map(category => {
        if (typeof category === "string") return category;

        return category.slug || category.id || "";
    }).filter(Boolean);
}

function getCategoryName(product) {
    if (!Array.isArray(product.categories) || !product.categories.length) {
        return "ULTOR COLLECTION";
    }

    const category = product.categories[0];

    if (typeof category === "string") {
        const found = shopCategories.find(item =>
            item.slug === category || item.id === category
        );

        return found?.name || category;
    }

    return category.name || "ULTOR COLLECTION";
}

function normalizeShopImageUrl(value) {
    if (!value) return null;

    // Unterstützt bereits vollständige URLs und absolute Website-Pfade.
    if (typeof value === "object") {
        value = value.image_key || value.imageKey || value.key ||
            value.url || value.image_url || value.src || null;
    }

    if (typeof value !== "string" || !value.trim()) return null;

    const raw = value.trim();

    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
        return raw;
    }

    if (raw.startsWith("/media/")) return raw;

    // R2-Schlüssel wie "shop/UUID.jpg" müssen über die Media-Route laufen.
    const key = raw.replace(/^\/+/, "").replace(/^media\//i, "");
    return "/media/" + key.split("/").map(encodeURIComponent).join("/");
}

function getProductImage(product) {
    const primary = normalizeShopImageUrl(product.primary_image);
    if (primary) return primary;

    if (Array.isArray(product.images) && product.images.length) {
        const image = product.images.find(item => item && item.is_primary) ||
            product.images[0];
        const imageUrl = normalizeShopImageUrl(image);
        if (imageUrl) return imageUrl;
    }

    return normalizeShopImageUrl(product.image_url || product.image || product.image_key);
}

function formatPrice(cents, currency = "EUR") {
    const value = cents === null || cents === undefined || cents === ""
        ? NaN
        : Number(cents);
    if (!Number.isFinite(value)) return "Preis folgt";

    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency
    }).format(value / 100);
}

// Einheitliche Preiszeile für Produktkarten und Produktdetailansicht.
// Ein Streichpreis wird nur angezeigt, wenn er tatsächlich über dem Verkaufspreis liegt.
function renderPriceDisplay(container, sellingPriceCents, comparePriceCents, currency = "EUR") {
    if (!container) return;

    container.replaceChildren();

    const sellingPrice = sellingPriceCents === null || sellingPriceCents === undefined || sellingPriceCents === ""
        ? NaN
        : Number(sellingPriceCents);
    if (!Number.isFinite(sellingPrice)) {
        const fallback = document.createElement("span");
        fallback.className = "product-price";
        fallback.textContent = "Preis folgt";
        container.appendChild(fallback);
        return;
    }

    const current = document.createElement("span");
    current.className = "product-price";
    current.textContent = formatPrice(sellingPrice, currency);
    container.appendChild(current);

    const comparePrice = comparePriceCents === null || comparePriceCents === undefined || comparePriceCents === ""
        ? NaN
        : Number(comparePriceCents);

    if (Number.isFinite(comparePrice) && comparePrice > sellingPrice) {
        const previous = document.createElement("s");
        previous.className = "product-compare-price";
        previous.textContent = formatPrice(comparePrice, currency);
        previous.setAttribute("aria-label", `Vorheriger Preis ${formatPrice(comparePrice, currency)}`);
        container.appendChild(previous);
    }
}

function ensureShopPriceStyles() {
    if (document.getElementById("ultorShopPriceStyles")) return;

    const style = document.createElement("style");
    style.id = "ultorShopPriceStyles";
    style.textContent = `
      .product-price-line{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px}
      .product-price-line .product-price{display:inline-block;margin:0}
      .product-price-line .product-compare-price{display:inline-block;color:#93899f;font-size:.88em;font-weight:600;line-height:1.3;text-decoration:line-through;text-decoration-thickness:1.5px;opacity:.85}
      .product-detail-price.product-price-line{margin:0 0 18px}
      .product-detail-price .product-price{color:inherit}
      .ultor-personalization{margin:18px 0;padding:15px;background:#171120;border:1px solid rgba(181,138,255,.35)}
      .ultor-personalization-toggle{display:flex;align-items:center;gap:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer}
      .ultor-personalization-toggle input{accent-color:#8735f5;width:17px;height:17px}
      .ultor-personalization-fields{display:grid;gap:10px;margin-top:14px}
      .ultor-personalization-fields[hidden]{display:none}
      .ultor-personalization-fields label{display:grid;gap:6px;color:#d8cce5;font-size:11px;font-weight:700}
      .ultor-personalization-input{width:100%;min-height:40px;padding:10px 12px;background:#09070e;border:1px solid #514064;border-radius:4px;color:#fff;font:inherit}
      .ultor-personalization-fields small{color:#bba9d3;font-size:10px;line-height:1.5}
    `;
    document.head.appendChild(style);
}

function getVariantLabel(variant) {
    if (variant.variant_name) return variant.variant_name;

    const options = [
        variant.option1_value,
        variant.option2_value,
        variant.option3_value
    ].filter(Boolean);

    return options.length ? options.join(" / ") : "Variante";
}

/* =========================================
   PRODUCT RENDERING
   ========================================= */

function renderShopProducts() {
    const productGrid = document.getElementById("productGrid");
    const emptyState = document.getElementById("productEmptyState");

    if (!productGrid || !emptyState) return;

    // Initial state: no product list until the visitor chooses a category.
    if (!activeCategory) {
        productGrid.replaceChildren();
        emptyState.hidden = true;
        setProductSectionVisible(false);
        return;
    }

    setProductSectionVisible(true);

    const filteredProducts = shopProducts.filter(product =>
        getProductCategories(product).includes(activeCategory)
    );

    productGrid.replaceChildren();

    if (!filteredProducts.length) {
        emptyState.hidden = false;

        const heading = emptyState.querySelector("h3");
        const paragraph = emptyState.querySelector("p");

        if (heading) {
            heading.textContent = "KEINE PRODUKTE GEFUNDEN.";
        }

        if (paragraph) {
            paragraph.textContent = "In dieser Kategorie sind aktuell keine Produkte verfügbar.";
        }

        return;
    }

    emptyState.hidden = true;

    filteredProducts.forEach(product => {
        const card = document.createElement("article");
        card.className = "product-card";

        const imageContainer = document.createElement("div");
        imageContainer.className = "product-image";

        const imageUrl = getProductImage(product);

        if (imageUrl) {
            const image = document.createElement("img");
            image.src = imageUrl;
            image.alt = product.name || "ULTOR Produkt";
            image.loading = "lazy";
            imageContainer.appendChild(image);
        } else {
            const placeholder = document.createElement("span");
            placeholder.textContent = "ULTOR";
            placeholder.className = "product-image-placeholder";
            imageContainer.appendChild(placeholder);
        }

        const details = document.createElement("div");
        details.className = "product-details";

        const category = document.createElement("span");
        category.className = "product-category";
        category.textContent = getCategoryName(product);

        const name = document.createElement("h3");
        name.textContent = product.name || "ULTOR Produkt";

        const description = document.createElement("p");
        description.textContent =
            product.short_description || product.description || "";

        const price = document.createElement("div");
        price.className = "product-price-line";
        renderPriceDisplay(
            price,
            product.price_cents,
            product.compare_at_price_cents,
            product.currency || "EUR"
        );

        const button = document.createElement("button");
        button.type = "button";
        button.className = "product-detail-button";
        button.textContent = "PRODUKT ANSEHEN";
        button.addEventListener("click", () => {
            openProductDetails(product.slug);
        });

        details.append(category, name, description, price, button);
        card.append(imageContainer, details);
        productGrid.appendChild(card);
    });
}

/* =========================================
   ULTOR CART
   Local cart state; checkout/payment can be connected later.
   ========================================= */

const ULTOR_CART_STORAGE_KEY = "ultor_shop_cart_v1";
let ultorCart = readStoredCart();

function readStoredCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ULTOR_CART_STORAGE_KEY) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item =>
            item && item.key && item.product_name &&
            Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 &&
            Number.isFinite(Number(item.unit_price_cents))
        ).map(item => ({
            ...item,
            quantity: Math.max(1, Number(item.quantity)),
            unit_price_cents: Number(item.unit_price_cents)
        }));
    } catch (error) {
        console.warn("ULTOR Warenkorb konnte nicht gelesen werden:", error);
        return [];
    }
}

function persistCart() {
    try {
        localStorage.setItem(ULTOR_CART_STORAGE_KEY, JSON.stringify(ultorCart));
    } catch (error) {
        console.warn("ULTOR Warenkorb konnte nicht gespeichert werden:", error);
    }
    renderCart();
}

function cartItemKey(product, variant, personalization = null) {
    const productKey = product.id || product.slug;
    const customKey = personalization?.enabled
        ? (personalization.name || "") + "::" + (personalization.number || "")
        : "standard";
    return productKey + "::" + (variant?.id || "default") + "::" + customKey;
}

function addProductToCart(product, variant = null, personalization = null) {
    const variants = Array.isArray(product.variants)
        ? product.variants.filter(item => !item.status || ["active", "published"].includes(item.status))
        : [];

    if (variants.length && !variant) {
        showCartFeedback("Bitte wähle zuerst eine Variante aus.");
        return false;
    }

    const rawPrice = variant && variant.price_cents !== null && variant.price_cents !== undefined
        ? variant.price_cents
        : product.price_cents;
    const baseUnitPrice = Number(rawPrice);
    const personalizationEnabled = Boolean(personalization?.enabled);
    const personalizationName = String(personalization?.name || "").trim().toUpperCase();
    const personalizationNumber = String(personalization?.number || "").trim();
    const validName = /^[\p{L}0-9 .'-]*$/u.test(personalizationName);
    const validNumber = /^\d{0,2}$/.test(personalizationNumber);

    if (personalizationEnabled &&
        ((!personalizationName && !personalizationNumber) ||
         personalizationName.length > 14 || !validName || !validNumber)) {
        showCartFeedback("Bitte prüfe Name (max. 14 Zeichen) und Nummer (max. 2 Ziffern).");
        return false;
    }

    const personalizationCents = personalizationEnabled ? 500 : 0;
    const unitPrice = baseUnitPrice + personalizationCents;
    if (!Number.isFinite(baseUnitPrice) || baseUnitPrice < 0) {
        showCartFeedback("Für dieses Produkt ist noch kein gültiger Preis hinterlegt.");
        return false;
    }

    const tracksInventory = Boolean(variant && Number(variant.track_inventory));
    const stockQuantity = variant && variant.stock_quantity !== null && variant.stock_quantity !== undefined
        ? Number(variant.stock_quantity)
        : null;
    if (tracksInventory && (!Number.isFinite(stockQuantity) || stockQuantity <= 0)) {
        showCartFeedback("Diese Variante ist aktuell nicht verfügbar.");
        return false;
    }

    const custom = personalizationEnabled ? {
        enabled: true,
        name: personalizationName,
        number: personalizationNumber,
        font: "ultor",
        color: "white",
        surcharge_cents: personalizationCents
    } : null;
    const key = cartItemKey(product, variant, custom);
    const existing = ultorCart.find(item => item.key === key);
    const nextQuantity = (existing?.quantity || 0) + 1;
    if (tracksInventory && nextQuantity > stockQuantity) {
        showCartFeedback("Es sind nur " + stockQuantity + " Stück verfügbar.");
        return false;
    }

    const line = {
        key,
        product_id: product.id || null,
        product_slug: product.slug || null,
        product_name: product.name || "ULTOR Produkt",
        variant_id: variant?.id || null,
        variant_name: variant ? getVariantLabel(variant) : null,
        sku: variant?.sku || null,
        unit_price_cents: unitPrice,
        base_unit_price_cents: baseUnitPrice,
        personalization_cents: personalizationCents,
        personalization: custom,
        currency: product.currency || "EUR",
        quantity: nextQuantity,
        image_url: getProductImage(product),
        track_inventory: tracksInventory,
        stock_quantity: stockQuantity
    };

    if (existing) Object.assign(existing, line);
    else ultorCart.push(line);
    persistCart();
    setCartOpen(true);
    showCartFeedback("Zum Warenkorb hinzugefügt.");
    return true;
}
function showCartFeedback(message) {
    const status = document.getElementById("ultorCartStatus");
    if (status) status.textContent = message;
}

function setCartOpen(open) {
    const root = document.getElementById("ultorCartRoot");
    if (!root) return;
    root.classList.toggle("is-open", Boolean(open));
    document.body.classList.toggle("ultor-cart-open", Boolean(open));
    const toggle = document.getElementById("ultorCartToggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(Boolean(open)));
}

function changeCartQuantity(key, delta) {
    const item = ultorCart.find(line => line.key === key);
    if (!item) return;
    const next = item.quantity + delta;
    if (next <= 0) {
        ultorCart = ultorCart.filter(line => line.key !== key);
    } else {
        if (item.track_inventory && Number.isFinite(Number(item.stock_quantity)) && next > Number(item.stock_quantity)) {
            showCartFeedback(`Es sind nur ${item.stock_quantity} Stück verfügbar.`);
            return;
        }
        item.quantity = next;
    }
    persistCart();
}

function removeCartItem(key) {
    ultorCart = ultorCart.filter(item => item.key !== key);
    persistCart();
}

function getCartTotals() {
    const itemCount = ultorCart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = ultorCart.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
    const currency = ultorCart[0]?.currency || "EUR";
    return { itemCount, subtotal, currency };
}

function formatCartPrice(cents, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency
    }).format(Number(cents || 0) / 100);
}

let ultorCheckoutConfig = null;
let ultorCheckoutBusy = false;
function setCheckoutNotice(message, type = "") {
 const el=document.getElementById("ultorCheckoutNotice"); if(!el)return;
 el.textContent=message; el.className=`ultor-checkout-notice${type?` is-${type}`:""}`;
}
function openCheckout() {
 if(!ultorCart.length){showCartFeedback("Dein Warenkorb ist noch leer.");return;}
 const layer=document.getElementById("ultorCheckoutLayer"); if(!layer)return;
 layer.classList.add("is-open"); layer.setAttribute("aria-hidden","false");
 renderCheckoutSummary(); loadCheckoutConfig();
}
function closeCheckout() {
 const layer=document.getElementById("ultorCheckoutLayer"); if(!layer)return;
 layer.classList.remove("is-open"); layer.setAttribute("aria-hidden","true");
}
function renderCheckoutSummary(shippingCents=null) {
 const items=document.getElementById("ultorCheckoutItems"); if(!items)return;
 items.replaceChildren();
 ultorCart.forEach(item=>{
  const line=document.createElement("div"); line.className="ultor-checkout-line";
  const customText = item.personalization?.enabled ? " · Rücken: " + [item.personalization.name, item.personalization.number].filter(Boolean).join(" / ") + " (+5,00 €)" : "";
  const title=document.createElement("span"); title.textContent=`${item.product_name}${item.variant_name?` / ${item.variant_name}`:""}${customText} × ${item.quantity}`;
  const price=document.createElement("strong"); price.textContent=formatCartPrice(item.unit_price_cents*item.quantity,item.currency);
  line.append(title,price); items.appendChild(line);
 });
 const {subtotal,currency}=getCartTotals();
 document.getElementById("ultorCheckoutSubtotal").textContent=formatCartPrice(subtotal,currency);
 document.getElementById("ultorCheckoutShipping").textContent=Number.isInteger(shippingCents)?formatCartPrice(shippingCents,currency):"Noch nicht festgelegt";
 document.getElementById("ultorCheckoutTotal").textContent=Number.isInteger(shippingCents)?formatCartPrice(subtotal+shippingCents,currency):"–";
}
async function loadCheckoutConfig() {
 const submit=document.getElementById("ultorCheckoutSubmit"); if(submit)submit.disabled=true;
 setCheckoutNotice("Checkout-Einstellungen werden geprüft …");
 try{
  const response=await fetch("/api/checkout/config",{headers:{"Accept":"application/json"},cache:"no-store"});
  const config=await response.json(); if(!response.ok||!config.success)throw new Error(config.error||"Checkout-Konfiguration nicht verfügbar.");
  ultorCheckoutConfig=config; renderCheckoutSummary(Number.isInteger(config.shipping_cents)?config.shipping_cents:null);
  if(config.checkout_available&&Number.isInteger(config.shipping_cents)){
   setCheckoutNotice("TESTMODUS: Es wird kein Geld eingezogen und kein Auftrag an Printful übermittelt. Diese Bestellung dient ausschließlich technischen Tests.","success");
   if(submit)submit.disabled=false;
  }else setCheckoutNotice("Das Formular ist vorbereitet. Der Test-Checkout ist serverseitig noch nicht freigeschaltet oder die Test-Versandkosten fehlen. Es kann noch keine Bestellung abgesendet werden.");
 }catch(error){console.error("Checkout-Konfiguration:",error);setCheckoutNotice("Der Checkout ist momentan nicht erreichbar. Bitte versuche es später erneut.","error");}
}
async function submitCheckout(event) {
 event.preventDefault(); if(ultorCheckoutBusy||!ultorCheckoutConfig?.checkout_available||!ultorCart.length)return;
 const form=document.getElementById("ultorCheckoutForm"), submit=document.getElementById("ultorCheckoutSubmit"), status=document.getElementById("ultorCheckoutStatus");
 if(!form.reportValidity())return;
 const data=new FormData(form), customerName=String(data.get("customer_name")||"").trim();
 const testAccessCode=String(data.get("test_access_code")||"");
 const payload={
  customer:{name:customerName,email:String(data.get("customer_email")||"").trim(),phone:String(data.get("customer_phone")||"").trim()},
  shipping:{name:String(data.get("shipping_name")||"").trim()||customerName,company:String(data.get("shipping_company")||"").trim(),address1:String(data.get("address1")||"").trim(),address2:String(data.get("address2")||"").trim(),postal_code:String(data.get("postal_code")||"").trim(),city:String(data.get("city")||"").trim(),state:String(data.get("state")||"").trim(),country_code:String(data.get("country_code")||"DE"),phone:String(data.get("shipping_phone")||"").trim()},
  customer_note:String(data.get("customer_note")||"").trim(),idempotency_key:crypto.randomUUID(),
  items:ultorCart.map(item=>({product_id:item.product_id,variant_id:item.variant_id,quantity:item.quantity,personalization:item.personalization||null}))
 };
 if(payload.items.some(item=>!item.product_id)){status.textContent="Ein Produkt im Warenkorb ist nicht eindeutig zugeordnet. Bitte entferne es und füge es erneut hinzu.";return;}
 ultorCheckoutBusy=true;submit.disabled=true;status.textContent="Testbestellung wird sicher gespeichert …";
 try{
  const response=await fetch("/api/checkout/orders",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json","X-Shop-Test-Code":testAccessCode},body:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Bestellung konnte nicht gespeichert werden.");
  ultorCart=[];persistCart();form.hidden=true;
  const success=document.getElementById("ultorCheckoutSuccess");success.hidden=false;success.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="TESTBESTELLUNG GESPEICHERT.";
  const paragraph=document.createElement("p");paragraph.textContent=`Testbestellung ${result.order?.order_number||""} gespeichert. Es wurde kein Geld eingezogen und kein Auftrag an Printful übermittelt.`;
  const close=document.createElement("button");close.type="button";close.textContent="Zurück zum Shop";
  close.addEventListener("click",()=>{closeCheckout();setCartOpen(false);form.reset();form.hidden=false;success.hidden=true;});
  success.append(heading,paragraph,close);setCheckoutNotice("Testbestellung erfolgreich gespeichert.","success");
 }catch(error){status.textContent=error.message||"Ein Fehler ist aufgetreten.";submit.disabled=false;}
 finally{ultorCheckoutBusy=false;}
}

function createCartInterface() {
    if (document.getElementById("ultorCartRoot")) return;

    const style = document.createElement("style");
    style.id = "ultorCartStyles";
    style.textContent = `
      #ultorCartRoot{position:relative;z-index:9990;font-family:inherit}
      #ultorCartToggle{position:fixed;right:28px;bottom:28px;z-index:9991;display:flex;align-items:center;gap:13px;padding:15px 19px;background:#8735f5;border:1px solid #a86aff;color:#fff;font-size:11px;font-weight:800;letter-spacing:1.5px;cursor:pointer;box-shadow:0 12px 36px rgba(0,0,0,.38);transition:.2s}
      #ultorCartToggle:hover{transform:translateY(-3px);background:#9b50ff}
      #ultorCartCount{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:50px;background:#fff;color:#241332;font-size:11px;letter-spacing:0}
      #ultorCartLayer{position:fixed;inset:0;z-index:9992;visibility:hidden;pointer-events:none}
      #ultorCartRoot.is-open #ultorCartLayer{visibility:visible;pointer-events:auto}
      #ultorCartBackdrop{position:absolute;inset:0;background:rgba(4,3,9,.76);opacity:0;transition:opacity .25s}
      #ultorCartRoot.is-open #ultorCartBackdrop{opacity:1}
      #ultorCartDrawer{position:absolute;top:0;right:0;bottom:0;width:min(480px,100%);display:flex;flex-direction:column;background:#100d18;border-left:1px solid rgba(181,138,255,.25);transform:translateX(102%);transition:transform .28s ease;box-shadow:-24px 0 70px rgba(0,0,0,.4)}
      #ultorCartRoot.is-open #ultorCartDrawer{transform:translateX(0)}
      #ultorCartHeader{display:flex;align-items:center;justify-content:space-between;padding:25px 25px 20px;border-bottom:1px solid rgba(255,255,255,.1)}
      #ultorCartHeader h2{margin:0;color:#f3f0f8;font-size:25px;font-weight:800}
      #ultorCartHeader h2 span{color:#a66aff}
      .ultor-cart-close{width:38px;height:38px;background:transparent;border:1px solid rgba(255,255,255,.18);color:#fff;font-size:25px;cursor:pointer}
      #ultorCartItems{flex:1;overflow:auto;padding:8px 25px}
      .ultor-cart-empty{padding:60px 10px;text-align:center;color:#aaa4b7;line-height:1.7}
      .ultor-cart-line{display:grid;grid-template-columns:78px minmax(0,1fr);gap:15px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.09)}
      .ultor-cart-line img,.ultor-cart-line-placeholder{width:78px;height:94px;object-fit:cover;background:#1a1424;display:flex;align-items:center;justify-content:center;color:#8d52d5;font-weight:900}
      .ultor-cart-line-main{min-width:0}
      .ultor-cart-line-title{margin:0 0 5px;color:#fff;font-size:14px;font-weight:800}
      .ultor-cart-line-variant{margin:0 0 8px;color:#aaa4b7;font-size:11px}
      .ultor-cart-line-price{color:#c49cff;font-size:13px;font-weight:800}
      .ultor-cart-line-controls{display:flex;align-items:center;gap:8px;margin-top:11px}
      .ultor-cart-qty{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.18)}
      .ultor-cart-qty button{width:30px;height:28px;background:transparent;border:0;color:#fff;font-size:16px;cursor:pointer}
      .ultor-cart-qty span{min-width:24px;text-align:center;color:#fff;font-size:12px}
      .ultor-cart-remove{margin-left:auto;background:transparent;border:0;color:#bba9d3;font-size:11px;text-decoration:underline;cursor:pointer}
      #ultorCartFooter{padding:20px 25px 25px;border-top:1px solid rgba(255,255,255,.1);background:#15111e}
      .ultor-cart-total{display:flex;justify-content:space-between;gap:20px;margin-bottom:12px;color:#fff;font-size:16px;font-weight:800}
      .ultor-cart-note{margin:0 0 15px;color:#aaa4b7;font-size:11px;line-height:1.6}
      #ultorCartCheckout{width:100%;padding:15px;background:#30243f;border:1px solid #58416f;color:#c9b7df;font-weight:800;letter-spacing:1px;cursor:not-allowed}
      #ultorCartStatus{min-height:18px;margin:9px 0 0;color:#c49cff;font-size:11px}
      #ultorCheckoutLayer{position:fixed;inset:0;z-index:10010;display:none;align-items:center;justify-content:center;padding:22px}
      #ultorCheckoutLayer.is-open{display:flex}
      #ultorCheckoutBackdrop{position:absolute;inset:0;background:rgba(3,2,7,.88);backdrop-filter:blur(5px)}
      #ultorCheckoutPanel{position:relative;width:min(760px,100%);max-height:92vh;overflow:auto;padding:28px;background:#100d18;border:1px solid rgba(181,138,255,.28);box-shadow:0 24px 90px rgba(0,0,0,.65);color:#f3f0f8}
      .ultor-checkout-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
      .ultor-checkout-header h2{margin:5px 0 0;font-size:30px}.ultor-checkout-header h2 span{color:#a66aff}
      .ultor-checkout-kicker{font-size:10px;letter-spacing:2px;color:#a66aff;font-weight:800}
      #ultorCheckoutClose{width:40px;height:40px;background:transparent;border:1px solid rgba(255,255,255,.2);color:#fff;font-size:25px;cursor:pointer}
      .ultor-checkout-notice{padding:12px 14px;margin-bottom:20px;background:#21172d;border:1px solid #50356b;color:#d8c1f5;font-size:12px;line-height:1.6}
      .ultor-checkout-notice.is-error{background:#2b1419;border-color:#73303b;color:#ffb6bf}
      .ultor-checkout-notice.is-success{background:#10251d;border-color:#286044;color:#8cf0b4}
      .ultor-checkout-section{padding:18px 0;border-bottom:1px solid rgba(255,255,255,.1)}
      .ultor-checkout-section h3{margin:0 0 15px;font-size:17px}
      .ultor-checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
      .ultor-checkout-grid label,.ultor-checkout-note-label{display:flex;flex-direction:column;gap:6px;color:#cfc4dc;font-size:11px;font-weight:700}
      .ultor-checkout-grid .full{grid-column:1/-1}
      #ultorCheckoutPanel input:not([type=checkbox]),#ultorCheckoutPanel select,#ultorCheckoutPanel textarea{width:100%;min-height:43px;padding:11px 12px;background:#09070e;border:1px solid #40334e;color:#fff;font:inherit;font-size:13px;border-radius:5px}
      #ultorCheckoutPanel textarea{resize:vertical}
      #ultorCheckoutItems{display:grid;gap:9px;margin-bottom:15px}
      .ultor-checkout-line{display:flex;justify-content:space-between;gap:16px;color:#d8cce5;font-size:12px}
      .ultor-checkout-total{display:flex;justify-content:space-between;padding:8px 0;color:#cfc4dc;font-size:13px}
      .ultor-checkout-total.grand{margin-top:5px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18);font-size:17px;color:#fff}
      .ultor-checkout-total strong{color:#fff}
      .ultor-checkout-note-label{margin-top:18px}
      .ultor-checkout-test-ack{display:flex;align-items:flex-start;gap:10px;margin:18px 0;color:#cfc4dc;font-size:11px;line-height:1.6}
      .ultor-checkout-test-ack input{margin-top:3px;accent-color:#8735f5}
      .ultor-checkout-submit{width:100%;padding:15px;background:#8735f5;border:1px solid #a66aff;color:#fff;font-weight:800;letter-spacing:1px;cursor:pointer}
      .ultor-checkout-submit:disabled{opacity:.45;cursor:not-allowed}
      #ultorCheckoutStatus{min-height:20px;color:#c49cff;font-size:12px;line-height:1.5}
      #ultorCheckoutSuccess{padding:30px 10px;text-align:center}
      #ultorCheckoutSuccess h3{font-size:24px;color:#fff}
      #ultorCheckoutSuccess p{color:#cfc4dc;line-height:1.7}
      #ultorCheckoutSuccess button{margin-top:12px;padding:12px 20px;background:#8735f5;border:0;color:#fff;font-weight:800;cursor:pointer}

      @media(max-width:600px){#ultorCartToggle{right:14px;bottom:14px;padding:13px 15px}#ultorCartHeader,#ultorCartItems{padding-left:18px;padding-right:18px}#ultorCartFooter{padding:17px 18px 20px}#ultorCheckoutLayer{padding:0}#ultorCheckoutPanel{width:100%;height:100%;max-height:100vh;padding:20px 16px}.ultor-checkout-grid{grid-template-columns:1fr}.ultor-checkout-grid .full{grid-column:auto}.ultor-checkout-line{font-size:11px}}
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "ultorCartRoot";
    root.innerHTML = `
      <button id="ultorCartToggle" type="button" aria-expanded="false" aria-controls="ultorCartDrawer">
        <span>WARENKORB</span><span id="ultorCartCount">0</span>
      </button>
      <div id="ultorCartLayer" aria-hidden="true">
        <div id="ultorCartBackdrop"></div>
        <aside id="ultorCartDrawer" role="dialog" aria-modal="true" aria-label="Warenkorb">
          <header id="ultorCartHeader">
            <h2>DEIN <span>WARENKORB.</span></h2>
            <button class="ultor-cart-close" type="button" aria-label="Warenkorb schließen">×</button>
          </header>
          <div id="ultorCartItems"></div>
          <footer id="ultorCartFooter">
            <div class="ultor-cart-total"><span>Zwischensumme</span><span id="ultorCartSubtotal">0,00 €</span></div>
            <p class="ultor-cart-note">Versandkosten und Steuern werden im späteren Bestellschritt berechnet. Der Warenkorb wird aktuell lokal auf diesem Gerät gespeichert.</p>
            <button id="ultorCartCheckout" type="button">ZUR KASSE</button>
            <p id="ultorCartStatus" aria-live="polite"></p>
          </footer>
        </aside>
      </div>
          <div id="ultorCheckoutLayer" aria-hidden="true">
        <div id="ultorCheckoutBackdrop"></div>
        <section id="ultorCheckoutPanel" role="dialog" aria-modal="true" aria-labelledby="ultorCheckoutTitle">
          <header class="ultor-checkout-header">
            <div><span class="ultor-checkout-kicker">ULTOR ESPORTS STORE</span><h2 id="ultorCheckoutTitle">KASSE<span>.</span></h2></div>
            <button id="ultorCheckoutClose" type="button" aria-label="Checkout schließen">×</button>
          </header>
          <div id="ultorCheckoutNotice" class="ultor-checkout-notice" role="status">Checkout wird vorbereitet …</div>
          <form id="ultorCheckoutForm">
            <div class="ultor-checkout-section"><h3>Kontakt</h3><div class="ultor-checkout-grid">
              <label>Vor- und Nachname<input name="customer_name" autocomplete="name" required maxlength="160"></label>
              <label>E-Mail-Adresse<input name="customer_email" type="email" autocomplete="email" required maxlength="254"></label>
              <label class="full">Telefon (optional)<input name="customer_phone" type="tel" autocomplete="tel" maxlength="40"></label>
            </div></div>
            <div class="ultor-checkout-section"><h3>Lieferadresse</h3><div class="ultor-checkout-grid">
              <label class="full">Name des Empfängers<input name="shipping_name" autocomplete="shipping name" required maxlength="160"></label>
              <label class="full">Firma (optional)<input name="shipping_company" autocomplete="shipping organization" maxlength="160"></label>
              <label class="full">Straße und Hausnummer<input name="address1" autocomplete="shipping address-line1" required maxlength="180"></label>
              <label class="full">Adresszusatz (optional)<input name="address2" autocomplete="shipping address-line2" maxlength="180"></label>
              <label>Postleitzahl<input name="postal_code" autocomplete="shipping postal-code" required maxlength="24"></label>
              <label>Stadt<input name="city" autocomplete="shipping address-level2" required maxlength="120"></label>
              <label>Bundesland (optional)<input name="state" autocomplete="shipping address-level1" maxlength="120"></label>
              <label>Land<select name="country_code" autocomplete="shipping country" required><option value="DE" selected>Deutschland</option><option value="AT">Österreich</option><option value="CH">Schweiz</option><option value="BE">Belgien</option><option value="NL">Niederlande</option><option value="LU">Luxemburg</option><option value="FR">Frankreich</option><option value="IT">Italien</option><option value="ES">Spanien</option><option value="PL">Polen</option><option value="DK">Dänemark</option><option value="SE">Schweden</option><option value="GB">Vereinigtes Königreich</option></select></label>
              <label class="full">Telefon für die Zustellung (optional)<input name="shipping_phone" type="tel" autocomplete="shipping tel" maxlength="40"></label>
            </div></div>
            <div class="ultor-checkout-section"><h3>Bestellübersicht</h3>
              <div id="ultorCheckoutItems"></div>
              <div class="ultor-checkout-total"><span>Zwischensumme</span><strong id="ultorCheckoutSubtotal">–</strong></div>
              <div class="ultor-checkout-total"><span>Versand</span><strong id="ultorCheckoutShipping">Noch nicht festgelegt</strong></div>
              <div class="ultor-checkout-total grand"><span>Gesamtbetrag</span><strong id="ultorCheckoutTotal">–</strong></div>
            </div>
            <label class="ultor-checkout-note-label">Interner Testzugangscode<input name="test_access_code" type="password" autocomplete="off" required minlength="32" maxlength="256" placeholder="Testcode eingeben"></label>
            <label class="ultor-checkout-note-label">Anmerkung zur Bestellung (optional)<textarea name="customer_note" rows="3" maxlength="1000"></textarea></label>
            <label class="ultor-checkout-test-ack"><input type="checkbox" name="test_ack" required><span>Ich bestätige, dass dies ausschließlich eine technische Testbestellung ohne Zahlung und ohne Versand ist.</span></label>
            <button id="ultorCheckoutSubmit" class="ultor-checkout-submit" type="submit" disabled>TESTBESTELLUNG ABSENDEN</button>
            <p id="ultorCheckoutStatus" aria-live="polite"></p>
          </form>
          <div id="ultorCheckoutSuccess" hidden></div>
        </section>
      </div>
`;
    document.body.appendChild(root);

    document.getElementById("ultorCartToggle").addEventListener("click", () => setCartOpen(true));
    document.getElementById("ultorCartCheckout").addEventListener("click", openCheckout);
    document.getElementById("ultorCheckoutClose").addEventListener("click", closeCheckout);
    document.getElementById("ultorCheckoutBackdrop").addEventListener("click", closeCheckout);
    document.getElementById("ultorCheckoutForm").addEventListener("submit", submitCheckout);
    root.querySelector(".ultor-cart-close").addEventListener("click", () => setCartOpen(false));
    document.getElementById("ultorCartBackdrop").addEventListener("click", () => setCartOpen(false));
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") setCartOpen(false);
    });

    renderCart();
}

function renderCart() {
    const root = document.getElementById("ultorCartRoot");
    if (!root) return;

    const { itemCount, subtotal, currency } = getCartTotals();
    const count = document.getElementById("ultorCartCount");
    const items = document.getElementById("ultorCartItems");
    const subtotalElement = document.getElementById("ultorCartSubtotal");

    if (count) count.textContent = String(itemCount);
    if (subtotalElement) subtotalElement.textContent = formatCartPrice(subtotal, currency);
    if (!items) return;

    items.replaceChildren();
    if (!ultorCart.length) {
        const empty = document.createElement("p");
        empty.className = "ultor-cart-empty";
        empty.textContent = "Dein Warenkorb ist noch leer. Entdecke die ULTOR Kollektion.";
        items.appendChild(empty);
        return;
    }

    ultorCart.forEach(item => {
        const line = document.createElement("article");
        line.className = "ultor-cart-line";

        if (item.image_url) {
            const image = document.createElement("img");
            image.src = item.image_url;
            image.alt = item.product_name;
            image.loading = "lazy";
            line.appendChild(image);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "ultor-cart-line-placeholder";
            placeholder.textContent = "ULTOR";
            line.appendChild(placeholder);
        }

        const main = document.createElement("div");
        main.className = "ultor-cart-line-main";
        const title = document.createElement("h3");
        title.className = "ultor-cart-line-title";
        title.textContent = item.product_name;
        const variant = document.createElement("p");
        variant.className = "ultor-cart-line-variant";
        const customization = item.personalization?.enabled ? " · Rücken: " + [item.personalization.name, item.personalization.number].filter(Boolean).join(" / ") : "";
        variant.textContent = ([item.variant_name, item.sku].filter(Boolean).join(" · ") || "Standard") + customization;
        const price = document.createElement("div");
        price.className = "ultor-cart-line-price";
        price.textContent = formatCartPrice(item.unit_price_cents * item.quantity, item.currency);

        const controls = document.createElement("div");
        controls.className = "ultor-cart-line-controls";
        const quantity = document.createElement("div");
        quantity.className = "ultor-cart-qty";
        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";
        minus.setAttribute("aria-label", "Menge verringern");
        minus.addEventListener("click", () => changeCartQuantity(item.key, -1));
        const number = document.createElement("span");
        number.textContent = String(item.quantity);
        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Menge erhöhen");
        plus.addEventListener("click", () => changeCartQuantity(item.key, 1));
        if (item.track_inventory && item.quantity >= Number(item.stock_quantity)) plus.disabled = true;
        quantity.append(minus, number, plus);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ultor-cart-remove";
        remove.textContent = "Entfernen";
        remove.addEventListener("click", () => removeCartItem(item.key));
        controls.append(quantity, remove);
        main.append(title, variant, price, controls);
        line.appendChild(main);
        items.appendChild(line);
    });
}

// A small public interface makes later checkout integration straightforward.
// Prices stored in this browser cart are display values only; the future order API
// must re-read current prices and stock from D1 before creating an order.
window.ULTORCart = {
    getItems: () => ultorCart.map(item => ({ ...item })),
    getTotals: () => ({ ...getCartTotals() }),
    clear: () => { ultorCart = []; persistCart(); },
    open: () => setCartOpen(true)
};

/* =========================================
   PRODUCT DETAIL MODAL
   ========================================= */

function createProductModal() {
    if (document.getElementById("productDetailModal")) return;

    const modal = document.createElement("div");
    modal.id = "productDetailModal";
    modal.className = "product-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "detailProductName");

    const backdrop = document.createElement("div");
    backdrop.className = "product-modal-backdrop";

    const panel = document.createElement("div");
    panel.className = "product-modal-panel";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "product-modal-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Fenster schließen");
    closeButton.addEventListener("click", closeProductDetails);

    const content = document.createElement("div");
    content.className = "product-modal-content";
    content.id = "productModalContent";

    panel.append(closeButton, content);
    modal.append(backdrop, panel);
    document.body.appendChild(modal);

    backdrop.addEventListener("click", closeProductDetails);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.hidden) {
            closeProductDetails();
        }
    });
}

async function openProductDetails(slug) {
    if (!slug) return;

    createProductModal();

    const modal = document.getElementById("productDetailModal");
    const content = document.getElementById("productModalContent");

    modal.hidden = false;
    document.body.classList.add("shop-modal-open");

    content.innerHTML = `
        <div class="shop-loading">
            <span>ULTOR</span>
            <p>Produkt wird geladen ...</p>
        </div>
    `;

    try {
        const data = await shopApiRequest(
            `/${encodeURIComponent(slug)}`
        );

        if (!data.product) {
            throw new Error("Produkt wurde nicht gefunden.");
        }

        renderProductDetails(data.product);

    } catch (error) {
        console.error("Produktdetails konnten nicht geladen werden:", error);

        content.replaceChildren();

        const message = document.createElement("p");
        message.className = "product-detail-error";
        message.textContent =
            "Die Produktdetails konnten nicht geladen werden. Bitte versuche es erneut.";

        content.appendChild(message);
    }
}

function renderProductDetails(product) {
    const content = document.getElementById("productModalContent");
    if (!content) return;

    content.replaceChildren();

    const layout = document.createElement("div");
    layout.className = "product-detail-layout";

    /* IMAGE */

    const imageArea = document.createElement("div");
    imageArea.className = "product-detail-image";

    const imageUrl = getProductImage(product);

    if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = product.name || "ULTOR Produkt";
        imageArea.appendChild(image);
    } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "ULTOR";
        placeholder.className = "product-image-placeholder";
        imageArea.appendChild(placeholder);
    }

    /* INFORMATION */

    const info = document.createElement("div");
    info.className = "product-detail-info";

    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = getCategoryName(product);

    const name = document.createElement("h2");
    name.id = "detailProductName";
    name.textContent = product.name || "ULTOR Produkt";

    const description = document.createElement("p");
    description.className = "product-detail-description";
    description.textContent =
        product.description ||
        product.short_description ||
        "Weitere Produktinformationen folgen.";

    const price = document.createElement("div");
    price.className = "product-detail-price product-price-line";

    const variants = Array.isArray(product.variants)
        ? product.variants
        : [];

    const activeVariants = variants.filter(variant =>
        !variant.status ||
        ["active", "published"].includes(variant.status)
    );

    const variantLabel = document.createElement("label");
    variantLabel.className = "product-variant-label";
    variantLabel.textContent = "VARIANTE";

    const variantSelect = document.createElement("select");
    variantSelect.className = "product-variant-select";
    variantSelect.setAttribute("aria-label", "Produktvariante auswählen");

    const stockInfo = document.createElement("p");
    stockInfo.className = "product-stock-info";
    let selectedVariant = null;

    const personalizable = /jersey|trikot/i.test(String(product.slug || "") + " " + String(product.name || ""));
    const personalizationBox = document.createElement("div"); personalizationBox.className = "ultor-personalization";
    const personalizationToggle = document.createElement("label"); personalizationToggle.className = "ultor-personalization-toggle";
    const personalizationCheckbox = document.createElement("input"); personalizationCheckbox.type = "checkbox";
    const personalizationTitle = document.createElement("span"); personalizationTitle.textContent = "Rücken personalisieren (+5,00 €)";
    personalizationToggle.append(personalizationCheckbox, personalizationTitle);
    const personalizationFields = document.createElement("div"); personalizationFields.className = "ultor-personalization-fields"; personalizationFields.hidden = true;
    const nameLabel = document.createElement("label"); nameLabel.textContent = "Name auf dem Rücken (max. 14 Zeichen)";
    const nameInput = document.createElement("input"); nameInput.type = "text"; nameInput.maxLength = 14; nameInput.autocomplete = "off"; nameInput.placeholder = "z. B. STRATE"; nameInput.className = "ultor-personalization-input"; nameInput.style.cssText = "font-family:Barlow Condensed,sans-serif;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#fff"; nameLabel.appendChild(nameInput);
    const numberLabel = document.createElement("label"); numberLabel.textContent = "Nummer (optional)";
    const numberInput = document.createElement("input"); numberInput.type = "text"; numberInput.inputMode = "numeric"; numberInput.maxLength = 2; numberInput.pattern = "[0-9]{1,2}"; numberInput.placeholder = "z. B. 07"; numberInput.className = "ultor-personalization-input"; numberLabel.appendChild(numberInput);
    const personalizationHint = document.createElement("small"); personalizationHint.textContent = "Weiße ULTOR-Schrift · Aufpreis 5,00 € pro Trikot";
    personalizationFields.append(nameLabel, numberLabel, personalizationHint);
    personalizationCheckbox.addEventListener("change", () => { personalizationFields.hidden = !personalizationCheckbox.checked; });
    if (personalizable) personalizationBox.append(personalizationToggle, personalizationFields); else personalizationBox.hidden = true;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "product-detail-button shop-cart-add-button";
    addButton.textContent = "IN DEN WARENKORB";

    function updateVariant(variant) {
        selectedVariant = variant || null;
        const baseCurrentPrice = variant && variant.price_cents !== null && variant.price_cents !== undefined
            ? Number(variant.price_cents)
            : Number(product.price_cents);
        const currentPrice = baseCurrentPrice + (personalizationCheckbox.checked ? 500 : 0);
        const comparePrice = variant && variant.compare_at_price_cents !== null && variant.compare_at_price_cents !== undefined
            ? Number(variant.compare_at_price_cents)
            : product.compare_at_price_cents;

        renderPriceDisplay(
            price,
            currentPrice,
            comparePrice,
            product.currency || "EUR"
        );

        const soldOut = Boolean(variant && Number(variant.track_inventory) && Number(variant.stock_quantity) <= 0);
        if (variant && Number(variant.track_inventory)) {
            stockInfo.textContent = Number(variant.stock_quantity) > 0
                ? `${variant.stock_quantity} verfügbar`
                : "Aktuell nicht verfügbar";
        } else {
            stockInfo.textContent = "";
        }

        addButton.disabled = soldOut || (activeVariants.length > 0 && !selectedVariant);
        addButton.textContent = soldOut ? "AUSVERKAUFT" : "IN DEN WARENKORB";
    }

    personalizationCheckbox.addEventListener("change", () => updateVariant(selectedVariant));


    if (activeVariants.length) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Bitte auswählen";
        placeholder.selected = true;
        variantSelect.appendChild(placeholder);

        activeVariants.forEach(variant => {
            const option = document.createElement("option");
            option.value = String(variant.id);
            option.textContent = getVariantLabel(variant);

            if (
                variant.track_inventory &&
                Number(variant.stock_quantity) <= 0
            ) {
                option.disabled = true;
                option.textContent += " – Ausverkauft";
            }

            variantSelect.appendChild(option);
        });

        variantSelect.addEventListener("change", () => {
            const selected = activeVariants.find(variant =>
                String(variant.id) === variantSelect.value
            );

            if (selected) {
                updateVariant(selected);
            } else {
                updateVariant(null);
            }
        });

    } else {
        variantLabel.textContent = "KEINE VARIANTEN HINTERLEGT";
        variantSelect.hidden = true;
    }

    updateVariant(null);

    addButton.disabled = activeVariants.length > 0;
    addButton.addEventListener("click", () => {
        if (activeVariants.length && !selectedVariant) {
            showCartFeedback("Bitte wähle zuerst eine Variante aus.");
            return;
        }
        let personalization = null;
        if (personalizationCheckbox.checked) {
            const customName = nameInput.value.trim().toUpperCase();
            const customNumber = numberInput.value.trim();
            if ((!customName && !customNumber) || customName.length > 14 || !/^[\p{L}0-9 .\'-]*$/u.test(customName) || !/^\d{0,2}$/.test(customNumber)) {
                showCartFeedback("Bitte gib einen Namen oder eine Nummer ein. Name max. 14 Zeichen, Nummer max. 2 Ziffern."); return;
            }
            personalization = { enabled: true, name: customName, number: customNumber };
        }
        if (addProductToCart(product, selectedVariant, personalization)) {
            addButton.textContent = "HINZUGEFÜGT ✓";
            window.setTimeout(() => {
                if (addButton.isConnected) addButton.textContent = "IN DEN WARENKORB";
            }, 1200);
        }
    });

    info.append(category, name, description, price);
    if (personalizable) info.append(personalizationBox);

    if (activeVariants.length) {
        info.append(variantLabel, variantSelect);
    }

    info.append(stockInfo, addButton);

    layout.append(imageArea, info);
    content.appendChild(layout);
}

function closeProductDetails() {
    const modal = document.getElementById("productDetailModal");

    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove("shop-modal-open");
}

/* =========================================
   INITIALIZATION
   ========================================= */

function initializeUltorShop() {
    setProductSectionVisible(false);
    ensureShopPriceStyles();
    createCartInterface();
    loadShopData();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUltorShop, { once: true });
} else {
    initializeUltorShop();
}
