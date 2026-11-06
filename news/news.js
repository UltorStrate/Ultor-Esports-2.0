
const newsGrid = document.getElementById("newsGrid");
const newsStatus = document.getElementById("newsStatus");
const newsArticle = document.getElementById("newsArticle");
const articleContent = document.getElementById("articleContent");

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + "Z"
  );

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function imageMarkup(key, className) {
  if (!key) {
    return `<div class="news-card-no-image">ULTOR</div>`;
  }

  const safeKey = String(key);

  if (!/^news\/[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/i.test(safeKey)) {
    return `<div class="news-card-no-image">ULTOR</div>`;
  }

  return `<img class="${className}" src="/media/${encodeURIComponent(safeKey)}" alt="" loading="lazy">`;
}

function renderNews(items) {
  newsGrid.replaceChildren();

  if (!items.length) {
    newsStatus.textContent = "Aktuell gibt es noch keine veröffentlichten Beiträge.";
    return;
  }

  newsStatus.textContent = `${items.length} veröffentlichte Beiträge`;

  newsGrid.innerHTML = items.map(item => `
    <article class="news-card">
      ${imageMarkup(item.image_key, "news-card-image")}
      <div class="news-card-body">
        <div class="news-card-date">${escapeHTML(formatDate(item.published_at))}</div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.excerpt || "")}</p>
        <a class="news-card-link"
           href="/news/?slug=${encodeURIComponent(item.slug)}">
          ARTIKEL LESEN ↗
        </a>
      </div>
    </article>
  `).join("");
}

async function loadNews() {
  try {
    const response = await fetch("/api/news");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "News konnten nicht geladen werden.");
    }

    renderNews(data.news || []);
  } catch (error) {
    console.error("News loading error:", error);
    newsStatus.textContent = "Die News konnten gerade nicht geladen werden.";
  }
}

async function loadArticle(slug) {
  newsGrid.hidden = true;
  newsArticle.hidden = false;
  newsStatus.hidden = true;

  try {
    const response = await fetch(
      `/api/news/${encodeURIComponent(slug)}`
    );

    const data = await response.json();

    if (!response.ok || !data.article) {
      throw new Error(data.error || "Artikel nicht gefunden.");
    }

    const article = data.article;

    articleContent.innerHTML = `
      <div class="article-date">
        ${escapeHTML(formatDate(article.published_at))}
      </div>
      <h1 class="article-title">${escapeHTML(article.title)}</h1>
      ${article.image_key
        ? imageMarkup(article.image_key, "article-image")
        : ""}
      ${article.excerpt
        ? `<p class="article-excerpt">${escapeHTML(article.excerpt)}</p>`
        : ""}
      <div class="article-body">${escapeHTML(article.content)}</div>
    `;

    document.title = `${article.title} | ULTOR ESPORTS`;
  } catch (error) {
    console.error("Article loading error:", error);
    articleContent.innerHTML = `
      <h1 class="article-title">Artikel nicht gefunden.</h1>
      <p class="article-body">Dieser Beitrag ist nicht verfügbar oder wurde nicht veröffentlicht.</p>
    `;
  }
}

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug");

if (slug) {
  loadArticle(slug);
} else {
  loadNews();
}

