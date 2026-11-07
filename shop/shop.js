
/* =========================================
   ULTOR ESPORTS - OFFICIAL SHOP
   API, PRODUCTS & PRODUCT DETAILS
   ========================================= */

const SHOP_API = "/api/shop";

let shopProducts = [];
let shopCategories = [];
let activeCategory = "all";

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
   LOAD SHOP DATA
   ========================================= */

async function loadShopData() {
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

function renderShopCategories() {
    const cards = document.querySelectorAll(".category-card");

    cards.forEach((card, index) => {
        const category = shopCategories[index];

        if (!category) return;

        const categoryId = category.slug || category.id;
        card.dataset.category = categoryId;
        card.href = "#products";

        const heading = card.querySelector("h3");

        if (heading) {
            heading.textContent = category.name;
        }

        card.onclick = event => {
            event.preventDefault();
            setActiveCategory(categoryId);

            document.getElementById("products")?.scrollIntoView({
                behavior: "smooth"
            });
        };
    });
}

function setActiveCategory(categoryId) {
    activeCategory = categoryId || "all";

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
    if (typeof cents !== "number") return "Preis folgt";

    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency
    }).format(cents / 100);
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

    const filteredProducts = shopProducts.filter(product => {
        if (activeCategory === "all") return true;

        return getProductCategories(product).includes(activeCategory);
    });

    productGrid.replaceChildren();

    if (!filteredProducts.length) {
        emptyState.hidden = false;

        const heading = emptyState.querySelector("h3");
        const paragraph = emptyState.querySelector("p");

        if (heading) {
            heading.textContent = activeCategory === "all"
                ? "DIE KOLLEKTION ENTSTEHT."
                : "KEINE PRODUKTE GEFUNDEN.";
        }

        if (paragraph) {
            paragraph.textContent = activeCategory === "all"
                ? "Wir arbeiten an den ersten offiziellen ULTOR Produkten. Schau bald wieder vorbei!"
                : "In dieser Kategorie sind aktuell keine Produkte verfügbar.";
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

        const price = document.createElement("span");
        price.className = "product-price";
        price.textContent = formatPrice(
            product.price_cents,
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
    price.className = "product-detail-price";

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

    function updateVariant(variant) {
        const currentPrice = variant &&
            typeof variant.price_cents === "number"
            ? variant.price_cents
            : product.price_cents;

        price.textContent = formatPrice(
            currentPrice,
            product.currency || "EUR"
        );

        if (variant && variant.track_inventory) {
            stockInfo.textContent = variant.stock_quantity > 0
                ? `${variant.stock_quantity} verfügbar`
                : "Aktuell nicht verfügbar";
        } else {
            stockInfo.textContent = "";
        }
    }

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

    info.append(category, name, description, price);

    if (activeVariants.length) {
        info.append(variantLabel, variantSelect);
    }

    info.append(stockInfo);

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

document.addEventListener("DOMContentLoaded", () => {
    loadShopData();
});
