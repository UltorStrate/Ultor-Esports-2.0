
const newsGrid = document.getElementById("homeNewsGrid");
const newsStatus = document.getElementById("homeNewsStatus");

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatNewsDate(value) {
    if (!value) return "";

    const date = new Date(
        value.includes("T") ? value : value.replace(" ", "T") + "Z"
    );

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function getNewsImage(key) {
    if (!key || !/^news\/[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/i.test(key)) {
        return `
            <div class="home-news-no-image">
                <span>ULTOR</span>
            </div>
        `;
    }

    return `
        <img
            class="home-news-image"
            src="/media/${encodeURIComponent(key)}"
            alt=""
            loading="lazy"
        >
    `;
}

function renderHomeNews(items) {
    newsGrid.replaceChildren();

    if (!items.length) {
        newsStatus.textContent =
            "No news published yet. Stay tuned for the latest ULTOR updates.";
        return;
    }

    newsStatus.textContent = "LATEST FROM ULTOR ESPORTS";

    newsGrid.innerHTML = items.slice(0, 3).map(item => `
        <article class="home-news-card">
            <a href="/news/?slug=${encodeURIComponent(item.slug)}"
               class="home-news-card-image-link">
                ${getNewsImage(item.image_key)}
            </a>

            <div class="home-news-card-content">
                <span class="home-news-date">
                    ${escapeHTML(formatNewsDate(item.published_at))}
                </span>

                <h3>
                    ${escapeHTML(item.title)}
                </h3>

                <p>
                    ${escapeHTML(item.excerpt || "")}
                </p>

                <a
                    href="/news/?slug=${encodeURIComponent(item.slug)}"
                    class="home-news-readmore">
                    READ MORE ↗
                </a>
            </div>
        </article>
    `).join("");
}

async function loadHomeNews() {
    try {
        const response = await fetch("/api/news");
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error("News could not be loaded.");
        }

        renderHomeNews(data.news || []);
    } catch (error) {
        console.error("Homepage news error:", error);
        newsStatus.textContent =
            "News are currently unavailable. Please try again later.";
    }
}

loadHomeNews();

