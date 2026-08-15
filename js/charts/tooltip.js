/**
 * Shared singleton tooltip. Content is built with DOM APIs (textContent)
 * because series names and titles are data, not markup.
 */

let el = null;

function ensure() {
  if (!el) {
    el = document.createElement("div");
    el.className = "viz-tooltip";
    el.setAttribute("role", "status");
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {string} title
 * @param {Array<{key?: string, label: string, value: string, color?: string}>} rows
 */
export function tooltipContent(title, rows) {
  const frag = document.createDocumentFragment();
  if (title) {
    const t = document.createElement("div");
    t.className = "tt-title";
    t.textContent = title;
    frag.appendChild(t);
  }
  if (rows && rows.length) {
    const table = document.createElement("table");
    for (const r of rows) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      if (r.color) {
        const key = document.createElement("span");
        key.className = "tt-key";
        key.style.background = r.color;
        td1.appendChild(key);
      }
      td1.appendChild(document.createTextNode(r.label));
      const td2 = document.createElement("td");
      td2.className = "tt-val";
      td2.textContent = r.value;
      tr.append(td1, td2);
      table.appendChild(tr);
    }
    frag.appendChild(table);
  }
  return frag;
}

export function showTooltip(event, content) {
  const t = ensure();
  t.replaceChildren(content);
  t.classList.add("show");
  moveTooltip(event);
}

export function moveTooltip(event) {
  if (!el) return;
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = el.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > w - 8) x = event.clientX - r.width - pad;
  if (y + r.height > h - 8) y = event.clientY - r.height - pad;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}

export function hideTooltip() {
  if (el) el.classList.remove("show");
}
