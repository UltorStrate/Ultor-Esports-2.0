
/* =========================================
   ULTOR ESPORTS - PRODUCT SYSTEM
   ========================================= */

/*
  Produktstruktur:

  id          = eindeutige Produkt-ID
  name        = Produktname
  category    = Kategorie
  description = Beschreibung
  price       = Preis in Euro (vorerst null)
  image       = Produktbild
  status      = draft oder published
*/

const shopProducts = [];

const shopCategories = [
    {
        id: "teamwear",
        name: "Teamwear"
    },
    {
        id: "apparel",
        name: "Apparel"
    },
    {
        id: "accessories",
        name: "Accessories"
    },
    {
        id: "specials",
        name: "Limited Editions"
    }
];

/* =========================================
   PRODUCT RENDERING
   ========================================= */

function renderShopProducts() {
    const productGrid = document.getElementById("productGrid");
    const emptyState = document.getElementById("productEmptyState");

    if (!productGrid || !emptyState) return;

    const publishedProducts = shopProducts.filter(product =>
        product.status === "published"
    );

    productGrid.replaceChildren();

    if (publishedProducts.length === 0) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    publishedProducts.forEach(product => {
        const card = document.createElement("article");
        card.className = "product-card";

        const imageContainer = document.createElement("div");
        imageContainer.className = "product-image";

        if (product.image) {
            const image = document.createElement("img");
            image.src = product.image;
            image.alt = product.name;
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
        category.textContent = getCategoryName(product.category);

        const name = document.createElement("h3");
        name.textContent = product.name;

        const description = document.createElement("p");
        description.textContent = product.description || "";

        const price = document.createElement("span");
        price.className = "product-price";
        price.textContent = typeof product.price === "number"
            ? new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: "EUR"
            }).format(product.price)
            : "Preis folgt";

        details.append(category, name, description, price);
        card.append(imageContainer, details);
        productGrid.appendChild(card);
    });
}

/* =========================================
   CATEGORY HELPER
   ========================================= */

function getCategoryName(categoryId) {
    const category = shopCategories.find(item =>
        item.id === categoryId
    );

    return category ? category.name : "ULTOR COLLECTION";
}

/* =========================================
   INITIALIZATION
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
    renderShopProducts();

    console.log("ULTOR ESPORTS Shop erfolgreich geladen.");
});
