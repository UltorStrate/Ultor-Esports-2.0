(() => {
    "use strict";

    const API_BASE = "/api/teams";
    const MEDIA_BASE = "/media/";

    const statusEl = document.getElementById("teamsStatus");
    const countEl = document.getElementById("teamsCount");
    const tabsEl = document.getElementById("teamTabs");
    const panelEl = document.getElementById("teamPanel");
    const emptyEl = document.getElementById("teamsEmpty");

    const teamLogoEl = document.getElementById("teamLogo");
    const teamLogoFallbackEl = document.getElementById("teamLogoFallback");
    const teamNameEl = document.getElementById("teamName");
    const teamDescriptionEl = document.getElementById("teamDescription");
    const teamPlayerCountEl = document.getElementById("teamPlayerCount");
    const playersGridEl = document.getElementById("playersGrid");
    const substitutesSectionEl = document.getElementById("substitutesSection");
    const substitutesGridEl = document.getElementById("substitutesGrid");

    let teams = [];
    let selectedSlug = null;
    let requestVersion = 0;

    function mediaUrl(key) {
        if (!key || typeof key !== "string") return "";

        const parts = key.split("/");

        if (parts.some(part => !part || part === "." || part === "..")) {
            return "";
        }

        return MEDIA_BASE + parts.map(encodeURIComponent).join("/");
    }

    function setStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.toggle("is-error", isError);
        statusEl.hidden = false;
    }

    function makeTeamTab(team, index) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "team-tab";
        button.id = `team-tab-${index}`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", "teamPanel");
        button.dataset.slug = team.slug;
        button.setAttribute(
            "aria-selected",
            String(team.slug === selectedSlug)
        );

        button.tabIndex = team.slug === selectedSlug ? 0 : -1;

        if (team.logo_key) {
            const logo = document.createElement("img");

            logo.src = mediaUrl(team.logo_key);
            logo.alt = "";
            logo.loading = "lazy";
            logo.onerror = () => logo.remove();

            button.appendChild(logo);
        } else {
            const mark = document.createElement("span");

            mark.className = "team-tab-mark";
            mark.textContent = "U.";

            button.appendChild(mark);
        }

        const label = document.createElement("span");
        label.textContent = team.name || "Team";

        button.appendChild(label);

        button.addEventListener("click", () => {
            selectTeam(team.slug);
        });

        button.addEventListener("keydown", event => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
                return;
            }

            event.preventDefault();

            const buttons = [...tabsEl.querySelectorAll(".team-tab")];
            const currentIndex = buttons.indexOf(button);

            let nextIndex = currentIndex;

            if (event.key === "ArrowRight") {
                nextIndex = (currentIndex + 1) % buttons.length;
            }

            if (event.key === "ArrowLeft") {
                nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            }

            if (event.key === "Home") {
                nextIndex = 0;
            }

            if (event.key === "End") {
                nextIndex = buttons.length - 1;
            }

            buttons[nextIndex]?.focus();
            buttons[nextIndex]?.click();
        });

        return button;
    }

    function renderTabs() {
        tabsEl.replaceChildren();

        teams.forEach((team, index) => {
            tabsEl.appendChild(makeTeamTab(team, index));
        });

        tabsEl.hidden = teams.length === 0;
    }

    // =========================================
    // POSITIONEN UND ROLLEN-ICONS
    // =========================================

    function normalizePosition(position) {
        return String(position || "")
            .trim()
            .toLowerCase()
            .replace(/\s*lane$/, "");
    }

    function getRoleInfo(position) {
        const normalized = normalizePosition(position);

        const roles = {
            top: {
                label: "TOP",
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 20 10 5l4 9 3-5 4 11H3Z"/>
                    <path d="M10 5 12 9"/>
                </svg>`
            },

            jungle: {
                label: "JUNGLE",
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3 5 11h4l-3 5h5v5h2v-5h5l-3-5h4L12 3Z"/>
                </svg>`
            },

            mid: {
                label: "MID",
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8"/>
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
                </svg>`
            },

            adc: {
                label: "ADC",
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 3c10 2 14 9 14 18"/>
                    <path d="M5 3c-2 7 2 13 14 18"/>
                    <path d="m7 12 12-1M14 7l5 4-5 4"/>
                </svg>`
            },

            support: {
                label: "SUPPORT",
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3Z"/>
                    <path d="m8.5 12 2.3 2.3 4.7-5"/>
                </svg>`
            }
        };

        const aliases = {
            jgl: "jungle",
            jg: "jungle",
            bot: "adc",
            bottom: "adc",
            sup: "support"
        };

        const key = aliases[normalized] || normalized;

        return roles[key] || {
            label: position ? String(position).toUpperCase() : "PLAYER",
            icon: ""
        };
    }

    // =========================================
    // FESTE REIHENFOLGE DER SPIELER
    // TOP → JUNGLE → MID → ADC → SUPPORT
    // =========================================

    function getRoleSortOrder(position) {
        const normalized = normalizePosition(position);

        const aliases = {
            jgl: "jungle",
            jg: "jungle",
            bot: "adc",
            bottom: "adc",
            sup: "support"
        };

        const role = aliases[normalized] || normalized;

        const order = {
            top: 0,
            jungle: 1,
            mid: 2,
            adc: 3,
            support: 4
        };

        return Object.prototype.hasOwnProperty.call(order, role)
            ? order[role]
            : 99;
    }

    function sortPlayersByRole(players) {
        return [...players].sort((a, b) => {
            return getRoleSortOrder(a.position) - getRoleSortOrder(b.position);
        });
    }

    // =========================================
    // SPIELERKARTE
    // =========================================

    function renderPlayer(player) {
        const card = document.createElement("article");
        card.className = "player-card";

        const imageWrap = document.createElement("div");
        imageWrap.className = "player-image-wrap";

        if (player.image_key) {
            const image = document.createElement("img");

            image.className = "player-image";
            image.src = mediaUrl(player.image_key);
            image.alt = player.name
                ? `Portrait von ${player.name}`
                : "Spielerportrait";

            image.loading = "lazy";

            image.onerror = () => {
                image.remove();

                const placeholder = document.createElement("div");
                placeholder.className = "player-image-placeholder";
                placeholder.textContent = initials(player.name);

                imageWrap.prepend(placeholder);
            };

            imageWrap.appendChild(image);
        } else {
            const placeholder = document.createElement("div");

            placeholder.className = "player-image-placeholder";
            placeholder.textContent = initials(player.name);

            imageWrap.appendChild(placeholder);
        }

        const roleInfo = getRoleInfo(player.position);

        const role = document.createElement("span");
        role.className = "player-role";
        role.setAttribute("aria-label", `${roleInfo.label} Rolle`);

        if (roleInfo.icon) {
            const icon = document.createElement("span");
            icon.className = "player-role-icon";
            icon.innerHTML = roleInfo.icon;
            role.appendChild(icon);
        }

        const roleLabel = document.createElement("span");
        roleLabel.textContent = roleInfo.label;
        role.appendChild(roleLabel);

        imageWrap.appendChild(role);

        const content = document.createElement("div");
        content.className = "player-card-content";

        const name = document.createElement("h4");
        name.textContent = player.name || "Unknown player";

        const subtitle = document.createElement("p");
        subtitle.textContent = player.position || "ULTOR ESPORTS";

        content.append(name, subtitle);
        card.append(imageWrap, content);

        return card;
    }

    function initials(name) {
        const words = String(name || "U")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!words.length) {
            return "U.";
        }

        return words
            .slice(0, 2)
            .map(word => word[0])
            .join("")
            .toUpperCase();
    }

    function updateSelectedTab() {
        [...tabsEl.querySelectorAll(".team-tab")].forEach(button => {
            const selected = button.dataset.slug === selectedSlug;

            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
    }

    // =========================================
    // TEAM AUSWÄHLEN UND SPIELER LADEN
    // =========================================

    async function selectTeam(slug) {
        selectedSlug = slug;
        updateSelectedTab();

        const thisRequest = ++requestVersion;

        panelEl.hidden = false;

        playersGridEl.replaceChildren();
        substitutesGridEl.replaceChildren();

        substitutesSectionEl.hidden = true;

        const selectedTeam = teams.find(team => team.slug === slug);

        teamNameEl.textContent = selectedTeam?.name || "TEAM";
        teamDescriptionEl.textContent = selectedTeam?.description || "";

        teamPlayerCountEl.textContent =
            selectedTeam?.player_count ?? "0";

        if (selectedTeam?.logo_key) {
            teamLogoEl.hidden = false;
            teamLogoFallbackEl.hidden = true;

            teamLogoEl.src = mediaUrl(selectedTeam.logo_key);
            teamLogoEl.alt = `${selectedTeam.name} Logo`;

            teamLogoEl.onerror = () => {
                teamLogoEl.hidden = true;
                teamLogoFallbackEl.hidden = false;
            };
        } else {
            teamLogoEl.hidden = true;
            teamLogoEl.removeAttribute("src");

            teamLogoFallbackEl.hidden = false;
        }

        try {
            const response = await fetch(
                `${API_BASE}/${encodeURIComponent(slug)}`,
                {
                    headers: {
                        "Accept": "application/json"
                    },
                    cache: "no-store"
                }
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.error || "Das Team konnte nicht geladen werden."
                );
            }

            if (thisRequest !== requestVersion) {
                return;
            }

            const players = Array.isArray(data.players)
                ? data.players
                : [];

            const mainRoster = players.filter(
                player => Number(player.is_substitute) !== 1
            );

            const substitutes = players.filter(
                player => Number(player.is_substitute) === 1
            );

            const sortedMainRoster = sortPlayersByRole(mainRoster);
            const sortedSubstitutes = sortPlayersByRole(substitutes);

            teamPlayerCountEl.textContent = String(players.length);

            sortedMainRoster.forEach(player => {
                playersGridEl.appendChild(renderPlayer(player));
            });

            if (sortedMainRoster.length === 0) {
                const message = document.createElement("p");

                message.className = "teams-status";
                message.textContent =
                    "Für dieses Team sind aktuell noch keine Spieler eingetragen.";

                playersGridEl.appendChild(message);
            }

            if (sortedSubstitutes.length > 0) {
                substitutesSectionEl.hidden = false;

                sortedSubstitutes.forEach(player => {
                    substitutesGridEl.appendChild(renderPlayer(player));
                });
            }

            updateSelectedTab();

        } catch (error) {
            if (thisRequest !== requestVersion) {
                return;
            }

            const message = document.createElement("p");

            message.className = "teams-status is-error";
            message.textContent =
                error.message || "Spieler konnten nicht geladen werden.";

            playersGridEl.appendChild(message);
        }
    }

    // =========================================
    // TEAMS LADEN
    // =========================================

    async function loadTeams() {
        setStatus("Loading teams ...");

        try {
            const response = await fetch(API_BASE, {
                headers: {
                    "Accept": "application/json"
                },
                cache: "no-store"
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.error || "Teams konnten nicht geladen werden."
                );
            }

            teams = Array.isArray(data.teams)
                ? data.teams
                : [];

            statusEl.hidden = true;

            countEl.textContent =
                `${teams.length} ${teams.length === 1 ? "TEAM" : "TEAMS"}`;

            if (teams.length === 0) {
                tabsEl.hidden = true;
                panelEl.hidden = true;
                emptyEl.hidden = false;
                return;
            }

            emptyEl.hidden = true;

            selectedSlug = teams[0].slug;

            renderTabs();

            await selectTeam(selectedSlug);

        } catch (error) {
            setStatus(
                error.message ||
                "Teams konnten nicht geladen werden. Bitte später erneut versuchen.",
                true
            );

            countEl.textContent = "";
            tabsEl.hidden = true;
            panelEl.hidden = true;
        }
    }

    loadTeams();
})();
