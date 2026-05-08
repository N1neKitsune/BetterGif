# BetterGif

> A BetterDiscord plugin that adds a **Klipy-powered GIF picker** to Discord's toolbar — better search, one-click send, and personal favorites.

---

## The Problem with Discord's GIF Search

Discord's built-in GIF picker is powered by **Giphy**, and it shows. Search for anything remotely specific and you get:

- The same 5 overused trending GIFs recycled on every query
- Irrelevant results that barely match what you typed
- No real content filtering — "safe" mode is a suggestion at best
- Poor support for non-English searches
- A trending feed that feels copy-pasted across every Discord server

It's frustrating. You know the GIF you want exists. Giphy just can't find it.

---

## The Fix

BetterGif adds a **new GIF button** to Discord's toolbar, powered by the [Klipy](https://klipy.co) API. Discord's native button stays untouched — you just get a better option right next to it.

Klipy has a significantly better search engine — results are relevant, varied, and actually match what you type. Combined with one-click sending and a local favorites system, it makes GIF sharing in Discord feel fast and intuitive.

---

## Features

- **Better search** — Klipy returns relevant GIFs, not the same recycled top-10
- **One-click send** — click a GIF and it's sent immediately (no copy-paste, no confirm)
- **Insert mode** — optionally paste the GIF URL into the text box instead of auto-sending
- **Favorites** — star any GIF to save it locally; your favorites are always one tab away
- **Content filter** — configurable via settings (`off`, `low`, `medium`, `high`)
- **Locale support** — search in your language (`en`, `fr`, `de`, `es`, `ja`, etc.)
- **Non-invasive** — adds a new button to Discord's toolbar, the native GIF picker is left untouched
- **Clean UI** — minimal panel that fits naturally alongside Discord's existing toolbar buttons

---

## Preview

> *(Screenshots coming soon)*

---

## Installation

### Prerequisites
- [BetterDiscord](https://betterdiscord.app) installed

### Steps

1. Download [`BetterGif.plugin.js`](https://raw.githubusercontent.com/N1neKitsune/BetterGif/main/BetterGif.plugin.js)
2. Move it to your BetterDiscord plugins folder:
   - **Windows:** `%AppData%\BetterDiscord\plugins\`
   - **macOS:** `~/Library/Application Support/BetterDiscord/plugins/`
   - **Linux:** `~/.config/BetterDiscord/plugins/`
3. Open Discord → Settings → Plugins → Enable **BetterGif**

---

## Setup

BetterGif requires a free **Klipy API key**.

1. Go to [klipy.co](https://klipy.co) and create a free account
2. Copy your API key from the dashboard
3. In Discord: Settings → Plugins → BetterGif → ⚙️ Settings
4. Paste your API key and save

That's it. A new GIF icon powered by Klipy will appear in Discord's toolbar.

---

## Settings

| Setting | Description | Default |
|---|---|---|
| **API Key** | Your Klipy API key (required) | — |
| **Results per page** | How many GIFs to load per search | `20` |
| **Locale** | Search language (`en`, `fr`, `de`, etc.) | `en` |
| **Content filter** | Filter level: `off` / `low` / `medium` / `high` | `off` |
| **Send on click** | Send immediately on click vs. insert into text box | `on` |

---

## License

[MIT](LICENSE)

---

## Author

Made by [N1neKitsune](https://github.com/N1neKitsune)
