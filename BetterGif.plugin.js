/**
 * @name BetterGif
 * @description Replaces Discord's GIF picker with Klipy — search and send GIFs in one click, with favorites.
 * @version 1.0.0
 * @author N1neKitsune
 * @authorLink https://github.com/N1neKitsune
 * @website https://github.com/N1neKitsune/BetterGif
 * @source https://github.com/N1neKitsune/BetterGif
 * @updateUrl https://raw.githubusercontent.com/N1neKitsune/BetterGif/main/BetterGif.plugin.js
 */

module.exports = class BetterGif {
    constructor() {
        this.defaultSettings = {
            apiKey: "",
            gifLimit: 20,
            locale: "en",
            contentFilter: "off",
            autoSend: true,
        };
        this.settings = {};
        this.currentTab = "gifs";
        this.searchTimeout = null;
        this.panelRef = null;
        this.observer = null;
    }

    getName() { return "BetterGif"; }
    getDescription() { return "Replaces Discord's GIF picker with Klipy — search and send GIFs in one click, with favorites."; }
    getVersion() { return "1.0.0"; }
    getAuthor() { return "N1neKitsune"; }

    start() {
        const savedSettings = BdApi.Data.load("BetterGif", "settings") || {};
        // If autoSend was explicitly saved as false, we might want to respect it,
        // but for this update let's ensure it acts like Discord's native picker unless they re-disable it:
        if (!("autoSend" in savedSettings)) {
            savedSettings.autoSend = true;
        }
        this.settings = { ...this.defaultSettings, ...savedSettings };
        if (!["gifs", "favorites"].includes(this.currentTab)) this.currentTab = "gifs";
        if (!this.settings.apiKey) {
            BdApi.UI.showConfirmationModal(
                "BetterGif — Setup Required",
                "To use this plugin, you need to enter your Klipy API key.\n\nGet one for free at: https://partner.klipy.com/api-keys",
                {
                    confirmText: "Open Settings",
                    onConfirm: () => this.openSettings(),
                }
            );
        }
        this._cacheDiscordModules();
        this.injectCSS();
        this.patchMessageBar();
        console.log("[BetterGif] Started");
    }

    stop() {
        BdApi.Patcher.unpatchAll("BetterGif");
        BdApi.DOM.removeStyle("BetterGif-css");
        this.removePanel();
        // Disconnect MutationObserver to prevent memory leaks
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        // Remove any injected buttons
        document.querySelectorAll(".bettergif-toggle-btn").forEach(b => b.remove());
        this._messageActions = null;
        this._componentDispatch = null;
        this._selectedChannelStore = null;
        console.log("[BetterGif] Stopped");
    }

    _cacheDiscordModules() {
        try {
            this._messageActions = BdApi.Webpack.getByKeys("jumpToMessage", "_sendMessage")
                                || BdApi.Webpack.getByKeys("sendMessage", "editMessage");

            // ComponentDispatch pour INSERT_TEXT (méthode officielle, ne casse pas Slate)
            this._componentDispatch = BdApi.Webpack.getByKeys("dispatchToLastSubscribed");

            // SelectedChannelStore via getStore (API BD recommandée)
            this._selectedChannelStore = BdApi.Webpack.getStore?.("SelectedChannelStore")
                || BdApi.Webpack.getModule(BdApi.Webpack.Filters.byKeys("getChannelId", "getVoiceChannelId"));

            console.log("[BetterGif] Modules cachés —",
                "MessageActions:", !!this._messageActions,
                "ComponentDispatch:", !!this._componentDispatch,
                "ChannelStore:", !!this._selectedChannelStore
            );
        } catch (e) {
            console.error("[BetterGif] Erreur cache modules:", e);
        }
    }

    _getChannelId() {
        // Method 1: SelectedChannelStore via cached module
        try {
            const id = this._selectedChannelStore?.getChannelId?.()
                    || this._selectedChannelStore?.getCurrentlySelectedChannelId?.();
            if (id) return id;
        } catch (e) {}
        
        // Method 2: BetterDiscord's specific getStore API (newer BD versions)
        try {
            if (BdApi.Webpack && BdApi.Webpack.getStore) {
                const store = BdApi.Webpack.getStore("SelectedChannelStore");
                if (store && store.getChannelId) {
                    const id = store.getChannelId();
                    if (id) return id;
                }
            }
        } catch (e) {}

        // Method 3: Parse from URL (works reliably as a last resort)
        // Match /channels/1234/5678 or /channels/@me/5678
        const match = window.location.href.match(/\/channels\/[^\/]+\/(\d+)/);
        if (match) return match[1];
        
        return null;
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.className = "bettergif-settings";
        panel.innerHTML = `
            <style>
                .bettergif-settings { padding: 16px; color: #dcddde; font-family: 'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif; }
                .bettergif-settings h2 { color: #fff; margin-bottom: 16px; font-size: 20px; }
                .bettergif-settings .setting-group { margin-bottom: 16px; }
                .bettergif-settings label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #b9bbbe; }
                .bettergif-settings input[type="text"], .bettergif-settings input[type="number"] {
                    width: 100%; padding: 8px 12px; border-radius: 4px; border: 1px solid #202225;
                    background: #303338; color: #dcddde; font-size: 14px; box-sizing: border-box;
                }
                .bettergif-settings input:focus { border-color: #5865f2; outline: none; }
                .bettergif-settings .hint { font-size: 12px; color: #72767d; margin-top: 4px; }
                .bettergif-settings .btn {
                    display: inline-block; padding: 8px 16px; border-radius: 4px; border: none;
                    background: #5865f2; color: #fff; font-size: 14px; cursor: pointer; margin-top: 8px;
                }
                .bettergif-settings .btn:hover { background: #4752c4; }
                .bettergif-settings .checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
                .bettergif-settings .checkbox-row input { width: 18px; height: 18px; }
            </style>
            <h2>BetterGif — Settings</h2>
            <div class="setting-group">
                <label>Klipy API Key</label>
                <input type="text" id="bettergif-api-key" value="${this.settings.apiKey}" placeholder="Your API key here..." />
                <div class="hint">Get your key at <a href="#" onclick="require('electron').shell.openExternal('https://partner.klipy.com/api-keys'); return false;">partner.klipy.com/api-keys</a></div>
            </div>
            <div class="setting-group">
                <label>Results per page</label>
                <input type="number" id="bettergif-limit" value="${this.settings.gifLimit}" min="5" max="50" />
            </div>
            <div class="setting-group">
                <label>Locale</label>
                <input type="text" id="bettergif-locale" value="${this.settings.locale}" placeholder="en, fr, de..." />
            </div>
            <div class="setting-group">
                <label>Content filter</label>
                <input type="text" id="bettergif-filter" value="${this.settings.contentFilter}" placeholder="off, low, medium, high" />
                <div class="hint">off = show everything, high = most strict</div>
            </div>
            <div class="setting-group">
                <div class="checkbox-row">
                    <input type="checkbox" id="bettergif-autosend" ${this.settings.autoSend ? "checked" : ""} />
                    <label style="margin:0">Send directly on click (like Discord)</label>
                </div>
            </div>
            <button class="btn" id="bettergif-save-btn">💾 Save</button>
        `;

        panel.querySelector("#bettergif-save-btn").addEventListener("click", () => {
            this.settings.apiKey = panel.querySelector("#bettergif-api-key").value.trim();
            this.settings.gifLimit = parseInt(panel.querySelector("#bettergif-limit").value) || 20;
            this.settings.locale = panel.querySelector("#bettergif-locale").value.trim() || "en";
            this.settings.contentFilter = panel.querySelector("#bettergif-filter").value.trim() || "off";
            this.settings.autoSend = panel.querySelector("#bettergif-autosend").checked;
            BdApi.Data.save("BetterGif", "settings", this.settings);
            BdApi.UI.showToast("BetterGif settings saved!", { type: "success" });
        });

        return panel;
    }

    openSettings() {
        BdApi.UI.showToast("Go to Settings → Plugins → BetterGif → ⚙️", { type: "info" });
    }

    injectCSS() {
        const css = `
            /* BetterGif Panel */
            .bettergif-panel {
                position: absolute;
                bottom: 100%;
                left: 0;
                right: 0;
                max-height: 420px;
                background: #2f3136;
                border: 1px solid #202225;
                border-radius: 8px 8px 0 0;
                display: flex;
                flex-direction: column;
                z-index: 999;
                box-shadow: 0 -4px 16px rgba(0,0,0,0.3);
                animation: bettergif-slide-up 0.2s ease-out;
            }
            @keyframes bettergif-slide-up {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .bettergif-panel.hidden { display: none; }

            /* Header / Tabs */
            .bettergif-header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                border-bottom: 1px solid #202225;
                gap: 8px;
            }
            .bettergif-tabs {
                display: flex;
                gap: 4px;
            }
            .bettergif-tab {
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 600;
                color: #b9bbbe;
                cursor: pointer;
                border: none;
                background: transparent;
                transition: all 0.15s;
            }
            .bettergif-tab:hover { background: #40444b; color: #dcddde; }
            .bettergif-tab.active { background: #5865f2; color: #fff; }

            /* Search bar */
            .bettergif-search-wrap {
                flex: 1;
                position: relative;
            }
            .bettergif-search {
                width: 100%;
                padding: 6px 12px;
                border-radius: 4px;
                border: none;
                background: #40444b;
                color: #dcddde;
                font-size: 14px;
                outline: none;
                box-sizing: border-box;
            }
            .bettergif-search::placeholder { color: #72767d; }
            .bettergif-search:focus { box-shadow: 0 0 0 2px #5865f2; }

            /* Close button */
            .bettergif-close {
                background: none;
                border: none;
                color: #b9bbbe;
                font-size: 18px;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                line-height: 1;
            }
            .bettergif-close:hover { background: #40444b; color: #ed4245; }

            /* Grid */
            .bettergif-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 4px;
                padding: 8px;
                overflow-y: auto;
                flex: 1;
                max-height: 320px;
            }
            .bettergif-grid::-webkit-scrollbar { width: 8px; }
            .bettergif-grid::-webkit-scrollbar-track { background: #2f3136; }
            .bettergif-grid::-webkit-scrollbar-thumb { background: #202225; border-radius: 4px; }

            /* GIF item */
            .bettergif-item {
                position: relative;
                border-radius: 6px;
                overflow: hidden;
                cursor: pointer;
                aspect-ratio: 1;
                background: #202225;
                transition: transform 0.1s;
            }
            .bettergif-item:hover { transform: scale(1.03); }
            .bettergif-item img, .bettergif-item video {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }
            .bettergif-item .bettergif-overlay {
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.15s;
            }
            .bettergif-item:hover .bettergif-overlay { opacity: 1; }
            .bettergif-overlay-icon {
                font-size: 28px;
                color: #fff;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            }

            /* Loading */
            .bettergif-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 32px;
                color: #b9bbbe;
                font-size: 14px;
                gap: 8px;
            }
            .bettergif-spinner {
                width: 20px;
                height: 20px;
                border: 3px solid #40444b;
                border-top-color: #5865f2;
                border-radius: 50%;
                animation: bettergif-spin 0.8s linear infinite;
            }
            @keyframes bettergif-spin { to { transform: rotate(360deg); } }

            /* Empty / Error */
            .bettergif-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 32px;
                color: #72767d;
                text-align: center;
            }
            .bettergif-empty-icon { font-size: 48px; margin-bottom: 8px; }

            /* Toggle button in toolbar */
            .bettergif-toggle-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 4px;
                cursor: pointer;
                color: #b9bbbe;
                transition: all 0.15s;
                background: none;
                border: none;
                padding: 0;
            }
            .bettergif-toggle-btn:hover { color: #dcddde; background: #40444b; }
            .bettergif-toggle-btn.active { color: #5865f2; }
            .bettergif-toggle-btn svg { pointer-events: none; }

            /* Trending tags */
            .bettergif-trending {
                display: flex;
                gap: 6px;
                padding: 6px 12px;
                overflow-x: auto;
                border-bottom: 1px solid #202225;
            }
            .bettergif-trending::-webkit-scrollbar { height: 0; }
            .bettergif-tag {
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 12px;
                color: #dcddde;
                background: #40444b;
                cursor: pointer;
                white-space: nowrap;
                border: none;
                transition: background 0.15s;
            }
            .bettergif-tag:hover { background: #5865f2; }

            /* Favorite button on items */
            .bettergif-fav-btn {
                position: absolute;
                top: 6px;
                right: 6px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(0,0,0,0.6);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 15px;
                z-index: 2;
                opacity: 0;
                transition: opacity 0.15s, transform 0.15s, background 0.15s;
                line-height: 1;
                padding: 0;
            }
            .bettergif-item:hover .bettergif-fav-btn { opacity: 1; }
            .bettergif-fav-btn:hover { background: rgba(237, 66, 69, 0.8); transform: scale(1.15); }
            .bettergif-fav-btn.is-fav { opacity: 1; }
            .bettergif-fav-btn.is-fav::after { content: "❤️"; font-size: 15px; }
            .bettergif-fav-btn:not(.is-fav)::after { content: "🤍"; font-size: 15px; }

            /* Send button (left side) */
            .bettergif-send-btn {
                position: absolute;
                top: 6px;
                left: 6px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(88, 101, 242, 0.85);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                z-index: 2;
                opacity: 0;
                transition: opacity 0.15s, transform 0.15s;
                padding: 0;
            }
            .bettergif-item:hover .bettergif-send-btn { opacity: 1; }
            .bettergif-send-btn:hover { background: rgba(88, 101, 242, 1); transform: scale(1.15); }

            /* Remove from favorites button (X) */
            .bettergif-remove-btn {
                position: absolute;
                top: 6px;
                left: 6px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(237, 66, 69, 0.85);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #fff;
                z-index: 2;
                opacity: 0;
                transition: opacity 0.15s, transform 0.15s;
                padding: 0;
                font-weight: bold;
            }
            .bettergif-item:hover .bettergif-remove-btn { opacity: 1; }
            .bettergif-remove-btn:hover { background: rgba(237, 66, 69, 1); transform: scale(1.15); }

            /* Favorites tab star icon */
            .bettergif-tab .tab-icon { margin-right: 4px; }

            /* Favorites count badge */
            .bettergif-fav-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 16px;
                height: 16px;
                padding: 0 4px;
                border-radius: 8px;
                background: #ed4245;
                color: #fff;
                font-size: 10px;
                font-weight: 700;
                margin-left: 4px;
                line-height: 1;
            }
        `;
        BdApi.DOM.addStyle("BetterGif-css", css);
    }

    patchMessageBar() {
        // Find the channel text area container
        const ChannelTextAreaButtons = BdApi.Webpack.getModule(m =>
            m?.default?.displayName === "ChannelTextAreaButtons" ||
            (m?.default?.toString && m.default.toString().includes("attachButton"))
        );

        if (!ChannelTextAreaButtons) {
            // Fallback: use MutationObserver to inject the button (debounced)
            let debounceTimer = null;
            this.observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.injectButton(), 200);
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
            // Also try immediately
            setTimeout(() => this.injectButton(), 500);
            return;
        }

        BdApi.Patcher.after("BetterGif", ChannelTextAreaButtons, "default", () => {
            // We'll inject via DOM after render
            setTimeout(() => this.injectButton(), 100);
        });
    }

    _findMessageInputButtons() {
        // Strategy: find the form/container with the text input, then look for buttons INSIDE it
        // The channelTextArea contains: the text editor + a buttons container
        const textAreaContainers = document.querySelectorAll('[class*="channelTextArea"]');
        for (const container of textAreaContainers) {
            // Look for a buttons/toolbar div inside this specific text area
            const buttons = container.querySelector('[class*="buttons_"]') ||
                            container.querySelector('[class*="toolbar_"]');
            if (buttons) return buttons;
        }
        // Fallback: find the textbox and go up to find sibling buttons
        const textbox = document.querySelector('[role="textbox"][contenteditable="true"]');
        if (textbox) {
            // Walk up to find the form/container, then look for buttons
            let parent = textbox.parentElement;
            for (let i = 0; i < 8 && parent; i++) {
                const buttons = parent.querySelector('[class*="buttons_"]');
                if (buttons && buttons !== parent) return buttons;
                parent = parent.parentElement;
            }
        }
        return null;
    }

    injectButton() {
        // Don't inject if already present
        if (document.querySelector(".bettergif-toggle-btn")) return;

        const toolbar = this._findMessageInputButtons();
        if (!toolbar) return;

        const btn = document.createElement("button");
        btn.className = "bettergif-toggle-btn";
        btn.title = "BetterGif";
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm3 1v2h2V7H5zm0 4v2h2v-2H5zm0 4v2h2v-2H5zm12-8v2h2V7h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM9 7v10h6V7H9z"/>
        </svg>`;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.togglePanel(btn);
        });

        // Insert before the last button (usually send)
        const lastChild = toolbar.lastElementChild;
        if (lastChild) {
            toolbar.insertBefore(btn, lastChild);
        } else {
            toolbar.appendChild(btn);
        }
        console.log("[BetterGif] Button injected in message bar");
    }

    togglePanel(btnRef) {
        const existing = document.querySelector(".bettergif-panel");
        if (existing) {
            this.removePanel();
            return;
        }
        this.showPanel(btnRef);
    }

    removePanel() {
        const panel = document.querySelector(".bettergif-panel");
        if (panel) panel.remove();
        const btn = document.querySelector(".bettergif-toggle-btn");
        if (btn) btn.classList.remove("active");
    }

    showPanel(_btnRef) {
        if (!this.settings.apiKey) {
            BdApi.UI.showToast("Please configure your Klipy API key first!", { type: "warning" });
            return;
        }

        // Find the text area container to attach panel
        const textArea = document.querySelector('[class*="channelTextArea"]') ||
                         document.querySelector('[role="textbox"]')?.closest('[class*="textArea"]');
        if (!textArea) {
            BdApi.UI.showToast("Could not find the text area", { type: "error" });
            return;
        }

        const panel = document.createElement("div");
        panel.className = "bettergif-panel";
        this.panelRef = panel;

        // Build header with tabs
        const favCount = this.getFavorites().length;
        const favBadge = favCount > 0 ? `<span class="bettergif-fav-count">${favCount}</span>` : "";
        const tabsHTML = `
            <button class="bettergif-tab ${this.currentTab === 'gifs' ? 'active' : ''}" data-tab="gifs">GIFs</button>
            <button class="bettergif-tab ${this.currentTab === 'favorites' ? 'active' : ''}" data-tab="favorites"><span class="tab-icon">⭐</span>Favorites${favBadge}</button>
        `;

        panel.innerHTML = `
            <div class="bettergif-header">
                <div class="bettergif-tabs">${tabsHTML}</div>
                <div class="bettergif-search-wrap">
                    <input class="bettergif-search" type="text" placeholder="Search for a GIF..." autofocus />
                </div>
                <button class="bettergif-close" title="Close">✕</button>
            </div>
            <div class="bettergif-grid"></div>
        `;

        textArea.style.position = "relative";
        textArea.appendChild(panel);

        // Mark button as active
        const btn = document.querySelector(".bettergif-toggle-btn");
        if (btn) btn.classList.add("active");

        // Events
        const searchInput = panel.querySelector(".bettergif-search");
        const grid = panel.querySelector(".bettergif-grid");

        // Tab switching
        panel.querySelectorAll(".bettergif-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                panel.querySelectorAll(".bettergif-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                this.currentTab = tab.dataset.tab;

                if (this.currentTab === "favorites") {
                    searchInput.placeholder = "Favorites — no search here";
                    searchInput.value = "";
                    this.renderFavorites(grid);
                    return;
                }

                searchInput.placeholder = "Search for a GIF...";
                const q = searchInput.value.trim();
                if (q) {
                    this.search(q, grid);
                } else {
                    this.loadTrending(grid);
                }
            });
        });

        // Search
        searchInput.addEventListener("input", () => {
            if (this.currentTab === "favorites") return; // no search in favorites
            clearTimeout(this.searchTimeout);
            const q = searchInput.value.trim();
            if (!q) {
                this.loadTrending(grid);
                return;
            }
            this.searchTimeout = setTimeout(() => this.search(q, grid), 300);
        });

        // Close
        panel.querySelector(".bettergif-close").addEventListener("click", () => this.removePanel());

        // Load content on open based on current tab
        if (this.currentTab === "favorites") {
            searchInput.placeholder = "Favoris — pas de recherche ici";
            searchInput.value = "";
            this.renderFavorites(grid);
        } else {
            searchInput.placeholder = "Rechercher un GIF...";
            this.loadTrending(grid);
        }
    }

    getApiUrl(endpoint, params = {}) {
        const base = `https://api.klipy.com/api/v1/${this.settings.apiKey}`;
        const url = new URL(`${base}/${endpoint}`);
        url.searchParams.set("per_page", this.settings.gifLimit);
        url.searchParams.set("locale", this.settings.locale);
        url.searchParams.set("content_filter", this.settings.contentFilter);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        return url.toString();
    }

    async fetchAPI(url) {
        try {
            console.log("[BetterGif] Fetching:", url);
            // Use BdApi.Net.fetch to bypass CORS restrictions
            const fetchFn = (typeof BdApi !== "undefined" && BdApi.Net && BdApi.Net.fetch) 
                ? BdApi.Net.fetch.bind(BdApi.Net) 
                : fetch;
            const res = await fetchFn(url);
            const data = await res.json();
            console.log("[BetterGif] API Response:", JSON.stringify(data).substring(0, 800));
            
            // Klipy returns { result: true, data: { data: [...items...] } }
            if (data.result === false || data.status === "error") {
                console.error("[BetterGif] API Error:", data.errors || data.message || data);
                return null;
            }
            
            // Klipy actual response structure: { result: true, data: { data: [...] } }
            let items = null;
            if (data.data && Array.isArray(data.data.data)) {
                // Main format: data.data.data is the items array
                items = data.data.data;
            } else if (Array.isArray(data.data)) {
                items = data.data;
            } else if (Array.isArray(data)) {
                items = data;
            }
            
            if (!items) {
                console.warn("[BetterGif] Could not find items. Response keys:", 
                    Object.keys(data), data.data ? Object.keys(data.data) : "no data.data");
            }
            
            console.log("[BetterGif] Found", items?.length || 0, "items");
            return { ...data, _items: items || [] };
        } catch (e) {
            console.error("[BetterGif] Fetch error:", e);
            BdApi.UI.showToast("Klipy API error — check the console (F12)", { type: "error" });
            return null;
        }
    }

    async loadTrending(grid) {
        grid.innerHTML = `<div class="bettergif-loading"><div class="bettergif-spinner"></div>Loading...</div>`;
        const endpoint = `${this.currentTab}/trending`;
        const url = this.getApiUrl(endpoint, { page: 1 });
        const data = await this.fetchAPI(url);
        if (!data || !data._items || !data._items.length) {
            grid.innerHTML = `<div class="bettergif-empty"><div class="bettergif-empty-icon">😕</div>Failed to load trending content<br><span style="font-size:12px;opacity:0.7">Check your API key and open the console (F12) for debug info</span></div>`;
            return;
        }
        this.renderItems(data._items, grid);
    }

    async search(query, grid) {
        grid.innerHTML = `<div class="bettergif-loading"><div class="bettergif-spinner"></div>Searching...</div>`;
        const endpoint = `${this.currentTab}/search`;
        const url = this.getApiUrl(endpoint, { q: query, page: 1 });
        const data = await this.fetchAPI(url);
        if (!data || !data._items) {
            grid.innerHTML = `<div class="bettergif-empty"><div class="bettergif-empty-icon">😕</div>Search error</div>`;
            return;
        }
        if (!data._items.length) {
            grid.innerHTML = `<div class="bettergif-empty"><div class="bettergif-empty-icon">🔍</div>No results for "${query}"</div>`;
            return;
        }
        this.renderItems(data._items, grid);
    }

    renderItems(items, grid, append = false) {
        if (!append) grid.innerHTML = "";
        // Remove any existing load-more spinner
        grid.querySelector(".bettergif-load-more")?.remove();

        for (const item of items) {
            const el = this.buildItemElement(item);
            if (el) grid.appendChild(el);
        }

        // Infinite scroll: add load-more trigger if we got a full page
        if (items.length >= this.settings.gifLimit) {
            const loadMore = document.createElement("div");
            loadMore.className = "bettergif-loading bettergif-load-more";
            loadMore.innerHTML = `<div class="bettergif-spinner"></div>`;
            grid.appendChild(loadMore);

            // Delay observer to let DOM settle — prevents immediate fire on wide windows
            setTimeout(() => {
                if (!loadMore.isConnected) return; // already removed
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !this._isLoadingMore) {
                        observer.disconnect();
                        this.loadMore(grid, loadMore);
                    }
                }, { threshold: 0.1, root: grid });
                observer.observe(loadMore);
            }, 300);
        }
    }

    getThumbUrl(item) {
        // Klipy API: item.file.{sm,xs,md,hd}.{gif,webp,jpg}.url
        const f = item.file;
        if (f) {
            // For thumbnails: use small webp (fast loading) > small gif > medium
            return f.sm?.webp?.url || f.sm?.gif?.url || f.xs?.webp?.url || f.xs?.gif?.url ||
                   f.md?.webp?.url || f.md?.gif?.url || f.hd?.webp?.url || f.hd?.gif?.url || "";
        }
        // Fallback for non-standard responses
        return item.proxy_src || item.src || item.url || "";
    }

    getFullUrl(item) {
        // Klipy API: prefer HD gif for Discord embed (GIF URLs get auto-embedded)
        const f = item.file;
        if (f) {
            // For sending: use HD gif (Discord auto-embeds .gif URLs)
            return f.hd?.gif?.url || f.md?.gif?.url || f.sm?.gif?.url ||
                   f.hd?.mp4?.url || f.md?.mp4?.url || "";
        }
        // Fallback for non-standard responses
        return item.src || item.proxy_src || item.url || "";
    }

    // ═══════════════════════════════════════
    //   FAVORITES SYSTEM
    // ═══════════════════════════════════════

    getFavorites() {
        return BdApi.Data.load("BetterGif", "favorites") || [];
    }

    saveFavorites(favs) {
        BdApi.Data.save("BetterGif", "favorites", favs);
    }

    isFavorite(url) {
        return this.getFavorites().some(f => f.url === url);
    }

    addFavorite(url, item) {
        const favs = this.getFavorites();
        if (favs.some(f => f.url === url)) return; // already fav
        favs.unshift({
            url: url,
            thumb: this.getThumbUrl(item) || url,
            title: item.title || item.slug || "",
            type: this.currentTab,
            addedAt: Date.now(),
        });
        // Cap at 200 favorites
        if (favs.length > 200) favs.length = 200;
        this.saveFavorites(favs);
        this.updateFavBadge();
        BdApi.UI.showToast("Added to favorites ❤️", { type: "success" });
    }

    removeFavorite(url) {
        let favs = this.getFavorites();
        favs = favs.filter(f => f.url !== url);
        this.saveFavorites(favs);
        this.updateFavBadge();
        BdApi.UI.showToast("Removed from favorites", { type: "info" });
    }

    updateFavBadge() {
        const badge = document.querySelector(".bettergif-fav-count");
        const favs = this.getFavorites();
        if (badge) {
            badge.textContent = favs.length;
            badge.style.display = favs.length > 0 ? "" : "none";
        }
    }

    renderFavorites(grid) {
        const favs = this.getFavorites();
        grid.innerHTML = "";
        if (!favs.length) {
            grid.innerHTML = `
                <div class="bettergif-empty">
                    <div class="bettergif-empty-icon">⭐</div>
                    No favorites yet<br>
                    <span style="font-size:12px;margin-top:4px;opacity:0.7">Click ❤️ to add a GIF to your favorites</span>
                </div>
            `;
            return;
        }
        for (const fav of favs) {
            const el = document.createElement("div");
            el.className = "bettergif-item";

            if (fav.url.match(/\.(mp4|webm)$/i)) {
                el.innerHTML = `
                    <video src="${fav.thumb}" loop muted playsinline preload="metadata"></video>
                    <button class="bettergif-send-btn" title="Send">📤</button>
                    <button class="bettergif-remove-btn" title="Remove from favorites">✕</button>
                `;
                el.querySelector("video").addEventListener("mouseenter", (e) => e.target.play());
                el.querySelector("video").addEventListener("mouseleave", (e) => { e.target.pause(); e.target.currentTime = 0; });
            } else {
                el.innerHTML = `
                    <img src="${fav.thumb}" alt="${fav.title}" loading="lazy" />
                    <button class="bettergif-send-btn" title="Send">📤</button>
                    <button class="bettergif-remove-btn" title="Remove from favorites">✕</button>
                `;
            }

            // Send on click (anywhere on the item)
            el.addEventListener("click", (e) => {
                if (e.target.closest(".bettergif-remove-btn") || e.target.closest(".bettergif-send-btn")) return;
                this.sendGif(fav.url, { title: fav.title });
            });

            // Send button
            el.querySelector(".bettergif-send-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                this.sendGif(fav.url, { title: fav.title });
            });

            // Remove button
            el.querySelector(".bettergif-remove-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                this.removeFavorite(fav.url);
                // Animate removal
                el.style.transition = "transform 0.2s, opacity 0.2s";
                el.style.transform = "scale(0.8)";
                el.style.opacity = "0";
                setTimeout(() => el.remove(), 200);
                // Check if empty now
                setTimeout(() => {
                    if (!grid.querySelector(".bettergif-item")) {
                        this.renderFavorites(grid);
                    }
                }, 250);
            });

            grid.appendChild(el);
        }
    }

    // Build a single GIF item element (used by renderItems)
    buildItemElement(item) {
        const el = document.createElement("div");
        el.className = "bettergif-item";

        const thumbUrl = this.getThumbUrl(item);
        const fullUrl = this.getFullUrl(item);

        if (!fullUrl) return null;

        const isFav = this.isFavorite(fullUrl);
        const favClass = isFav ? "is-fav" : "";

        if (fullUrl && fullUrl.match(/\.(mp4|webm)$/i)) {
            el.innerHTML = `
                <video src="${thumbUrl || fullUrl}" loop muted playsinline preload="metadata"></video>
                <button class="bettergif-fav-btn ${favClass}" title="${isFav ? "Remove from favorites" : "Add to favorites"}"></button>
                <div class="bettergif-overlay"><span class="bettergif-overlay-icon">📤</span></div>
            `;
            el.querySelector("video").addEventListener("mouseenter", (e) => e.target.play());
            el.querySelector("video").addEventListener("mouseleave", (e) => { e.target.pause(); e.target.currentTime = 0; });
        } else {
            el.innerHTML = `
                <img src="${thumbUrl || fullUrl}" alt="${item.title || item.slug || ''}" loading="lazy" />
                <button class="bettergif-fav-btn ${favClass}" title="${isFav ? "Remove from favorites" : "Add to favorites"}"></button>
                <div class="bettergif-overlay"><span class="bettergif-overlay-icon">📤</span></div>
            `;
        }

        // Favorite toggle
        el.querySelector(".bettergif-fav-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            if (this.isFavorite(fullUrl)) {
                this.removeFavorite(fullUrl);
                btn.classList.remove("is-fav");
            } else {
                this.addFavorite(fullUrl, item);
                btn.classList.add("is-fav");
                // Little pop animation
                btn.style.transform = "scale(1.4)";
                setTimeout(() => btn.style.transform = "", 200);
            }
        });

        // Send on click
        el.addEventListener("click", (e) => {
            if (e.target.closest(".bettergif-fav-btn")) return;
            this.sendGif(fullUrl, item);
        });

        return el;
    }

    async loadMore(grid, loadMoreEl) {
        if (this._isLoadingMore) return;
        this._isLoadingMore = true;

        try {
            const q = document.querySelector(".bettergif-search")?.value?.trim();
            const endpoint = q ? `${this.currentTab}/search` : `${this.currentTab}/trending`;
            // Count actual items (exclude load-more spinners)
            const itemCount = grid.querySelectorAll(".bettergif-item").length;
            const nextPage = Math.floor(itemCount / this.settings.gifLimit) + 1;
            const params = { page: nextPage };
            if (q) params.q = q;

            const url = this.getApiUrl(endpoint, params);
            const data = await this.fetchAPI(url);

            loadMoreEl.remove();

            if (data?._items?.length) {
                // APPEND items instead of re-rendering everything
                this.renderItems(data._items, grid, true);
            }
        } finally {
            this._isLoadingMore = false;
        }
    }

    sendGif(url) {
        if (!url) {
            BdApi.UI.showToast("GIF URL not found", { type: "error" });
            return;
        }

        if (this.settings.autoSend) {
            this._directSendMessage(url);
        } else {
            this._insertIntoTextbox(url);
        }
    }

    _insertIntoTextbox(url) {
        const CD = this._componentDispatch || BdApi.Webpack.getByKeys("dispatchToLastSubscribed");
        if (CD?.dispatchToLastSubscribed) {
            this.removePanel();
            CD.dispatchToLastSubscribed("INSERT_TEXT", { rawText: url, plainText: url });
            BdApi.UI.showToast("GIF ready! Press Enter to send.", { type: "info" });
        } else {
            this._directSendMessage(url);
        }
    }

    async _directSendMessage(url) {
        const channelId = this._getChannelId();
        if (!channelId) {
            this._copyToClipboard(url, "Channel not found — URL copied");
            return;
        }

        const msgObj = { content: url, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] };

        try {
            const MA = BdApi.Webpack.getByKeys("jumpToMessage", "_sendMessage")
                    || BdApi.Webpack.getByKeys("sendMessage", "editMessage");
            if (typeof MA?.sendMessage === "function") {
                await MA.sendMessage(channelId, msgObj, true, {});
                this.removePanel();
                BdApi.UI.showToast("GIF sent!", { type: "success" });
                return;
            }
        } catch (e) { console.error("[BetterGif] sendMessage erreur:", e); }

        try {
            const MA = BdApi.Webpack.getByKeys("jumpToMessage", "_sendMessage");
            if (typeof MA?._sendMessage === "function") {
                await MA._sendMessage(channelId, msgObj, {});
                this.removePanel();
                BdApi.UI.showToast("GIF sent!", { type: "success" });
                return;
            }
        } catch (e) { console.error("[BetterGif] _sendMessage erreur:", e); }

        try {
            const CD = this._componentDispatch || BdApi.Webpack.getByKeys("dispatchToLastSubscribed");
            if (CD?.dispatchToLastSubscribed) {
                this.removePanel();
                await new Promise(r => setTimeout(r, 100));
                CD.dispatchToLastSubscribed("INSERT_TEXT", { rawText: url, plainText: url });
                await new Promise(r => setTimeout(r, 150));
                const sendBtn = document.querySelector('[aria-label="Send Message"]')
                             || document.querySelector('[aria-label="Envoyer un message"]');
                if (sendBtn) {
                    sendBtn.click();
                    BdApi.UI.showToast("GIF sent!", { type: "success" });
                    return;
                }
                BdApi.UI.showToast("M3: send button not found", { type: "warning" });
            } else {
                BdApi.UI.showToast("M3: ComponentDispatch not found", { type: "warning" });
            }
        } catch (e) {
            BdApi.UI.showToast("M3 error: " + e.message, { type: "error" });
        }

        this._copyToClipboard(url, "Failed to send — URL copied");
    }

    _copyToClipboard(url, msg) {
        let copied = false;
        
        try {
            // 1. Try DiscordNative (synchronous and extremely reliable in Discord desktop)
            if (typeof DiscordNative !== "undefined" && DiscordNative.clipboard) {
                DiscordNative.clipboard.copy(url);
                copied = true;
            } 
            
            // 2. Try Electron native clipboard
            if (!copied) {
                try {
                    const { clipboard } = require("electron");
                    clipboard.writeText(url);
                    copied = true;
                } catch (err) {}
            }
            
            // 3. Try legacy document.execCommand (synchronous, never hangs)
            if (!copied) {
                try {
                    const input = document.createElement("input");
                    input.value = url;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand("copy");
                    document.body.removeChild(input);
                    copied = true;
                } catch (e) {}
            }

            // 4. Try standard Web API (do NOT await, it can hang in Electron if blocked)
            if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).catch(()=>{});
            } 
        } catch (e) {
            console.error("[BetterGif] Clipboard API failed:", e);
        }

        this.removePanel();
        BdApi.UI.showToast(msg || "Copied to clipboard (paste it in chat!)", { type: "info" });
    }
};
