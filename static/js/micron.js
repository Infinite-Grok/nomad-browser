/**
 * micron.js — Micron markup renderer for Nomad Browser
 *
 * Parses NomadNet's Micron markup (.mu files) into DOM elements.
 * Ported and cleaned up from rBrowser's micron-parser_original.js.
 *
 * Micron markup reference:
 * https://github.com/markqvist/NomadNet/blob/master/nomadnet/ui/textui/Guide.py
 *
 * Usage:
 *   MicronParser.render(micronText, containerElement, { nodeHash: "abc123..." });
 *
 * Requires: purify.min.js loaded before this script.
 */

const MicronParser = (() => {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    const DEFAULT_FG = "ddd";   // dark theme default foreground
    const DEFAULT_BG = null;    // null means "no background set"

    const HEADING_STYLES = {
        1: { fg: "222", bg: "bbb", bold: false, underline: false, italic: false },
        2: { fg: "111", bg: "999", bold: false, underline: false, italic: false },
        3: { fg: "000", bg: "777", bold: false, underline: false, italic: false },
    };

    // -------------------------------------------------------------------------
    // Color helpers
    // -------------------------------------------------------------------------

    /**
     * Expand a Micron 3-digit hex color to a CSS color string.
     * Each digit is doubled: "F0a" → "#FF00aa"
     * Also handles grayscale "gNN" notation and plain 6-digit hex.
     */
    function colorToCss(c) {
        if (!c) return null;

        // 3-digit hex — each digit doubled
        if (/^[0-9a-fA-F]{3}$/.test(c)) {
            const r = c[0] + c[0];
            const g = c[1] + c[1];
            const b = c[2] + c[2];
            return `#${r}${g}${b}`;
        }

        // 6-digit hex
        if (/^[0-9a-fA-F]{6}$/.test(c)) {
            return `#${c}`;
        }

        // Grayscale "gNN" (0–99)
        if (/^g\d{1,2}$/.test(c)) {
            const val = Math.min(parseInt(c.slice(1), 10), 99);
            const h = Math.round(val * 2.55).toString(16).padStart(2, '0');
            return `#${h}${h}${h}`;
        }

        return null;
    }

    // -------------------------------------------------------------------------
    // State helpers
    // -------------------------------------------------------------------------

    function freshState() {
        return {
            literal: false,
            depth: 0,
            fg: DEFAULT_FG,
            bg: DEFAULT_BG,
            bold: false,
            italic: false,
            underline: false,
            align: "left",
            defaultAlign: "left",
        };
    }

    function snapshotStyle(state) {
        return {
            fg: state.fg,
            bg: state.bg,
            bold: state.bold,
            italic: state.italic,
            underline: state.underline,
        };
    }

    function restoreStyle(snap, state) {
        state.fg        = snap.fg;
        state.bg        = snap.bg;
        state.bold      = snap.bold;
        state.italic    = snap.italic;
        state.underline = snap.underline;
    }

    function resetFormatting(state) {
        state.bold      = false;
        state.italic    = false;
        state.underline = false;
        state.fg        = DEFAULT_FG;
        state.bg        = DEFAULT_BG;
        state.align     = state.defaultAlign;
    }

    // -------------------------------------------------------------------------
    // DOM helpers
    // -------------------------------------------------------------------------

    function applyStyle(el, style) {
        const fg = colorToCss(style.fg);
        const bg = colorToCss(style.bg);
        if (fg) el.style.color = fg;
        if (bg) {
            el.style.backgroundColor = bg;
            el.style.padding = "0 2px";
            el.style.display = "inline-block";
        }
        if (style.bold)      el.style.fontWeight  = "bold";
        if (style.italic)    el.style.fontStyle   = "italic";
        if (style.underline) el.style.textDecoration = "underline";
    }

    function stylesEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.fg === b.fg && a.bg === b.bg &&
               a.bold === b.bold && a.italic === b.italic &&
               a.underline === b.underline;
    }

    /**
     * Append an array of "parts" (style tuples or link/field objects) into a
     * container element, batching consecutive same-style text into one <span>.
     */
    function appendParts(container, parts) {
        let curSpan  = null;
        let curStyle = null;

        const flushSpan = () => {
            if (curSpan) {
                container.appendChild(curSpan);
                curSpan  = null;
                curStyle = null;
            }
        };

        for (const p of parts) {
            if (Array.isArray(p)) {
                // [styleSnapshot, safeHtmlString]
                const [style, html] = p;
                if (!stylesEqual(style, curStyle)) {
                    flushSpan();
                    curSpan = document.createElement("span");
                    applyStyle(curSpan, style);
                    curStyle = style;
                }
                curSpan.innerHTML += html;
            } else if (p && typeof p === 'object' && p.type === 'link') {
                flushSpan();
                container.appendChild(buildLinkEl(p));
            }
            // (field/checkbox/radio objects are stripped — not used in Nomad Browser)
        }

        flushSpan();
    }

    // -------------------------------------------------------------------------
    // Link building
    // -------------------------------------------------------------------------

    /**
     * Build an <a> element for a Micron link.
     * Link targets:
     *   - Starts with `:` → local page on same node  e.g. `:/page/path.mu`
     *   - Contains a hash separator → cross-node link  e.g. `abc123def:/page/path.mu`
     *   - Plain hash only → navigate to a node's index
     *
     * Calls window.nomadBrowser.navigateTo(hash, path) on click.
     */
    function buildLinkEl(linkObj) {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "mu-link";
        a.innerHTML = linkObj.label;
        applyStyle(a, linkObj.style);

        const rawTarget = linkObj.target;   // original, un-prefixed target string

        a.addEventListener("click", (e) => {
            e.preventDefault();
            if (!window.nomadBrowser || typeof window.nomadBrowser.navigateTo !== 'function') {
                console.warn("MicronParser: window.nomadBrowser.navigateTo is not defined");
                return;
            }

            if (!rawTarget) return;

            if (rawTarget.startsWith(":")) {
                // Local page — same node, just a path
                window.nomadBrowser.navigateTo(null, rawTarget.slice(1));
            } else if (rawTarget.includes(":")) {
                // Cross-node: "hash:/path"
                const sep = rawTarget.indexOf(":");
                const hash = rawTarget.slice(0, sep);
                const path = rawTarget.slice(sep + 1);
                window.nomadBrowser.navigateTo(hash, path || null);
            } else {
                // Bare hash — navigate to node index
                window.nomadBrowser.navigateTo(rawTarget, null);
            }
        });

        return a;
    }

    // -------------------------------------------------------------------------
    // Inline parser — returns array of parts for one line
    // -------------------------------------------------------------------------

    function parseParts(line, state) {
        // Literal mode: emit as-is
        if (state.literal) {
            const safe = escapeHtml(line);
            return [[snapshotStyle(state), safe]];
        }

        const parts = [];
        let buf   = "";
        let i     = 0;
        let esc   = false;

        const flush = () => {
            if (buf.length > 0) {
                parts.push([snapshotStyle(state), escapeHtml(buf)]);
                buf = "";
            }
        };

        while (i < line.length) {
            const c = line[i];

            if (esc) {
                buf += c;
                esc = false;
                i++;
                continue;
            }

            if (c === '\\') {
                esc = true;
                i++;
                continue;
            }

            // Double-backtick = full reset
            if (c === '`' && line[i + 1] === '`') {
                flush();
                resetFormatting(state);
                i += 2;
                continue;
            }

            // Single backtick = formatting command
            if (c === '`') {
                flush();
                i++;
                if (i >= line.length) break;
                const cmd = line[i];
                i++;

                switch (cmd) {
                    case '!': state.bold      = !state.bold;      break;
                    case '*': state.italic    = !state.italic;    break;
                    case '_': state.underline = !state.underline; break;

                    case 'F': {
                        // `Fxxx — set fg color (3 chars)
                        const color = line.substr(i, 3);
                        if (color.length === 3) {
                            state.fg = color;
                            i += 3;
                        }
                        break;
                    }
                    case 'f':
                        // Reset fg
                        state.fg = DEFAULT_FG;
                        break;

                    case 'B': {
                        // `Bxxx — set bg color (3 chars)
                        const color = line.substr(i, 3);
                        if (color.length === 3) {
                            state.bg = color;
                            i += 3;
                        }
                        break;
                    }
                    case 'b':
                        // Reset bg
                        state.bg = DEFAULT_BG;
                        break;

                    case 'c': state.align = 'center';           break;
                    case 'l': state.align = 'left';             break;
                    case 'r': state.align = 'right';            break;
                    case 'a': state.align = state.defaultAlign; break;

                    case '`':
                        // Full reset (second form)
                        resetFormatting(state);
                        break;

                    case '[': {
                        // Link: `[Label Text`:/path/page.mu]
                        // We stepped past the '[' already — find the closing ']'
                        const linkResult = parseLink(line, i - 1, state);
                        if (linkResult) {
                            parts.push(linkResult.obj);
                            i = linkResult.endIndex;
                        }
                        break;
                    }

                    default:
                        // Unknown command — ignore
                        break;
                }
                continue;
            }

            // Plain '[' link syntax (without leading backtick)
            if (c === '[') {
                const linkResult = parseBracketLink(line, i, state);
                if (linkResult) {
                    flush();
                    parts.push(linkResult.obj);
                    i = linkResult.endIndex;
                    continue;
                }
            }

            buf += c;
            i++;
        }

        flush();
        return parts;
    }

    /**
     * Parse a backtick-style link starting AFTER the opening '['.
     * Format: `[Label Text`:/path/page.mu]
     *
     * Called with startIndex pointing at '['.
     */
    function parseLink(line, startIndex, state) {
        const closePos = line.indexOf(']', startIndex);
        if (closePos === -1) return null;

        // Content between '[' and ']'
        const content = line.slice(startIndex + 1, closePos);

        // Split on backtick to get label and target
        // `[Label Text`:/page/path.mu]  →  parts = ["Label Text", ":/page/path.mu"]
        const backtickPos = content.indexOf('`');
        let label, target;

        if (backtickPos === -1) {
            // No backtick inside — entire content is the target, use it as label too
            target = content;
            label  = content;
        } else {
            label  = content.slice(0, backtickPos);
            target = content.slice(backtickPos + 1);
        }

        if (!target) return null;
        if (!label)  label = target;

        return {
            obj: {
                type:   "link",
                label:  escapeHtml(label),
                target: target,
                style:  snapshotStyle(state),
            },
            endIndex: closePos + 1,
        };
    }

    /**
     * Parse a bare bracket link (no leading backtick).
     * Same format as parseLink above — used when '[' appears directly in text.
     */
    function parseBracketLink(line, startIndex, state) {
        return parseLink(line, startIndex, state);
    }

    // -------------------------------------------------------------------------
    // HTML escape
    // -------------------------------------------------------------------------

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // -------------------------------------------------------------------------
    // Line-level renderer
    // -------------------------------------------------------------------------

    /**
     * Render a single Micron line into one or more DOM elements.
     * Returns an array of elements (may be empty for directives/comments).
     */
    function renderLine(line, state, pageOpts) {
        // Literal toggle
        if (line === "`=") {
            state.literal = !state.literal;
            return [];
        }

        if (!state.literal) {
            // Page-level directives (#!bg=xxx, #!fg=xxx, #!c=0)
            if (line.startsWith("#!")) {
                parseDirective(line, pageOpts);
                return [];
            }

            // Comments (lines starting with #)
            if (line[0] === "#") {
                return [];
            }

            // Reset section depth
            if (line[0] === "<") {
                state.depth = 0;
                return renderLine(line.slice(1), state, pageOpts);
            }

            // Section headings: one or more leading '>'
            if (line[0] === ">") {
                return renderHeadingLine(line, state, pageOpts);
            }

            // Horizontal dividers: '-' or '-X' where X is the repeat char
            if (line[0] === "-") {
                return renderDivider(line, state);
            }
        }

        // Regular content line
        return renderContentLine(line, state);
    }

    function parseDirective(line, pageOpts) {
        // #!bg=xxx
        const bgMatch = line.match(/^#!bg=([0-9a-fA-F]{3,6}|g\d{1,2})$/);
        if (bgMatch) { pageOpts.bg = bgMatch[1]; return; }

        // #!fg=xxx
        const fgMatch = line.match(/^#!fg=([0-9a-fA-F]{3,6}|g\d{1,2})$/);
        if (fgMatch) { pageOpts.fg = fgMatch[1]; return; }

        // #!c=0  (disable centering)
        if (line === "#!c=0") { pageOpts.centerDisabled = true; return; }
    }

    function renderHeadingLine(line, state, pageOpts) {
        let depth = 0;
        while (depth < line.length && line[depth] === ">") depth++;
        state.depth = depth;

        const text = line.slice(depth);
        if (!text) return [];

        const hStyle = HEADING_STYLES[depth] || HEADING_STYLES[3];
        const savedStyle = snapshotStyle(state);

        // Temporarily apply heading style
        state.fg        = hStyle.fg;
        state.bg        = hStyle.bg;
        state.bold      = hStyle.bold;
        state.italic    = hStyle.italic;
        state.underline = hStyle.underline;

        const parts = parseParts(text, state);
        restoreStyle(savedStyle, state);

        // Outer full-width div with heading background
        const outer = document.createElement("div");
        outer.style.display         = "block";
        outer.style.width           = "100%";
        outer.style.whiteSpace      = "pre";
        const fgCss = colorToCss(hStyle.fg);
        const bgCss = colorToCss(hStyle.bg);
        if (fgCss) outer.style.color           = fgCss;
        if (bgCss) outer.style.backgroundColor = bgCss;
        applyIndent(outer, state);

        appendParts(outer, parts);
        return [outer];
    }

    function renderDivider(line, state) {
        if (line.length === 1) {
            // Plain <hr>
            const hr = document.createElement("hr");
            hr.style.borderColor = colorToCss(state.fg) || "#ddd";
            hr.style.margin      = "0.25em 0";
            applyIndent(hr, state);
            return [hr];
        }

        // Repeated character divider
        const char    = line[1];
        const div     = document.createElement("div");
        div.style.whiteSpace  = "pre";
        div.style.overflow    = "hidden";
        div.style.width       = "100%";
        div.textContent       = char.repeat(300);
        const fgCss = colorToCss(state.fg);
        const bgCss = colorToCss(state.bg);
        if (fgCss) div.style.color           = fgCss;
        if (bgCss) div.style.backgroundColor = bgCss;
        applyIndent(div, state);
        return [div];
    }

    function renderContentLine(line, state) {
        const parts = parseParts(line, state);

        const div = document.createElement("div");
        div.style.whiteSpace = "pre";
        div.style.textAlign  = state.align || "left";
        applyIndent(div, state);

        // If there's a bg color on the line wrap with background
        const bgCss = colorToCss(state.bg);
        if (bgCss) {
            div.style.backgroundColor = bgCss;
            div.style.width           = "100%";
            div.style.display         = "block";
        }

        appendParts(div, parts);
        return [div];
    }

    function applyIndent(el, state) {
        const indent = (state.depth - 1) * 2;
        if (indent > 0) {
            // Each indent unit is ~1ch in a monospace font
            el.style.marginLeft = `${indent}ch`;
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Render Micron markup into containerElement.
     *
     * @param {string}      micronText      — raw Micron markup text
     * @param {HTMLElement} containerElement — DOM element to append rendered content into
     * @param {object}      options
     *   @param {string}    options.nodeHash — current node hash (for resolving relative links)
     */
    function render(micronText, containerElement, options = {}) {
        if (typeof DOMPurify === 'undefined') {
            console.error("MicronParser: DOMPurify is required. Load purify.min.js before micron.js.");
            return;
        }

        // Sanitize the whole input first
        const safeText = DOMPurify.sanitize(micronText, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

        const state    = freshState();
        const pageOpts = {
            bg:             null,
            fg:             null,
            centerDisabled: false,
        };

        const lines = safeText.split("\n");

        for (const line of lines) {
            const els = renderLine(line, state, pageOpts);
            for (const el of els) {
                containerElement.appendChild(el);
            }
        }

        // Apply page-level directives to the container
        if (pageOpts.bg) {
            const bgCss = colorToCss(pageOpts.bg);
            if (bgCss) containerElement.style.backgroundColor = bgCss;
        }
        if (pageOpts.fg) {
            const fgCss = colorToCss(pageOpts.fg);
            if (fgCss) containerElement.style.color = fgCss;
        }
    }

    return { render };

})();
