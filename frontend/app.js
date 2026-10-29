const form = document.querySelector("#generator-form");
const requirementInput = document.querySelector("#requirement");
const documentInput = document.querySelector("#documents");
const fileList = document.querySelector("#file-list");
const statusBox = document.querySelector("#status");
const builder = document.querySelector("#builder");
const prototype = document.querySelector("#prototype");
const appShell = document.querySelector("#app-shell");

const classNames = {
  button: "rounded-lg px-3 py-2 text-sm font-semibold transition",
  primary: "primary-action text-white",
  neutral: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "text-rose-600 hover:bg-rose-50",
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showStatus(message, kind = "error") {
  statusBox.className = `mt-4 rounded-xl border px-4 py-3 text-sm ${
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800"
  }`;
  statusBox.textContent = message;
}

function hideStatus() {
  statusBox.className = "mt-4 hidden rounded-xl border px-4 py-3 text-sm";
  statusBox.textContent = "";
}

function newRecordId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

requirementInput.addEventListener("input", () => {
  document.querySelector("#char-count").textContent = `${requirementInput.value.length} / 4000`;
});

documentInput.addEventListener("change", () => {
  fileList.replaceChildren();
  for (const file of documentInput.files) {
    const tag = node("span", "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700",
      `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
    fileList.append(tag);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideStatus();
  const files = Array.from(documentInput.files);
  if (files.length > 5) {
    showStatus("Choose no more than 5 supporting documents.");
    return;
  }
  if (files.some((file) => file.size > 5 * 1024 * 1024)) {
    showStatus("Each supporting document must be 5 MB or smaller.");
    return;
  }

  const button = document.querySelector("#generate-button");
  button.disabled = true;
  document.querySelector("#button-label").textContent = "Generating…";
  document.querySelector("#button-icon").classList.add("hidden");
  const data = new FormData();
  data.append("requirement", requirementInput.value.trim());
  for (const file of files) data.append("documents", file);

  try {
    const response = await fetch("/api/generate", { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "The prototype could not be generated.");
    renderApplication(result);
    builder.classList.add("hidden");
    prototype.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "The prototype could not be generated.");
  } finally {
    button.disabled = false;
    document.querySelector("#button-label").textContent = "Generate prototype";
    document.querySelector("#button-icon").classList.remove("hidden");
  }
});

document.querySelector("#back-button").addEventListener("click", () => {
  prototype.classList.add("hidden");
  builder.classList.remove("hidden");
  hideStatus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function storageKey(appSpec) {
  const name = appSpec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `prototype-studio:${name || "generated-app"}:${appSpec.screens.map((screen) => screen.id).join(",")}`;
}

function renderApplication(appSpec) {
  const primaryColor = /^#[0-9a-f]{6}$/i.test(appSpec.branding?.primaryColor || "")
    ? appSpec.branding.primaryColor
    : "#2563eb";
  appShell.style.setProperty("--app-primary", primaryColor);
  appShell.replaceChildren();

  const header = node("div", "flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7");
  const titleGroup = node("div");
  titleGroup.append(node("h1", "brand-font text-xl font-extrabold tracking-tight text-slate-900", appSpec.name));
  titleGroup.append(node("p", "mt-1 text-sm text-slate-500", appSpec.description));
  header.append(titleGroup);
  header.append(node("span", "w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600", "Interactive prototype"));
  appShell.append(header);

  const layout = node("div", "grid min-h-[550px] md:grid-cols-[220px_1fr]");
  const navigation = node("nav", "border-b border-slate-200 bg-slate-50/70 p-3 md:border-b-0 md:border-r md:p-4");
  navigation.setAttribute("aria-label", "Application screens");
  const navLabel = node("p", "px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400", "Workspace");
  navigation.append(navLabel);
  const screenArea = node("section", "min-w-0 p-4 sm:p-7");
  screenArea.setAttribute("aria-live", "polite");
  layout.append(navigation, screenArea);
  appShell.append(layout);

  const key = storageKey(appSpec);
  let activeScreenId = appSpec.navigation[0].id;

  for (const item of appSpec.navigation) {
    const navButton = node("button", "mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900");
    navButton.type = "button";
    navButton.dataset.screen = item.id;
    navButton.append(node("span", "grid h-7 w-7 place-items-center rounded-md bg-white text-xs font-bold text-slate-500", item.label.slice(0, 1).toUpperCase()));
    navButton.append(node("span", "truncate", item.label));
    navButton.addEventListener("click", () => {
      activeScreenId = item.id;
      renderScreen();
    });
    navigation.append(navButton);
  }

  function readRows(screen) {
    try {
      const saved = localStorage.getItem(`${key}:${screen.id}`);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Saved data is not a list.");
      return parsed;
    } catch (error) {
      console.error("Could not read prototype data from this browser.", error);
      showStatus("Could not read saved prototype data in this browser. Clear this app's local storage to continue.");
      return [];
    }
  }

  function saveRows(screen, rows) {
    try {
      localStorage.setItem(`${key}:${screen.id}`, JSON.stringify(rows));
      return true;
    } catch (error) {
      console.error("Could not save prototype data in this browser.", error);
      showStatus("Could not save data in this browser. Check available local storage and try again.");
      return false;
    }
  }

  function fieldControl(field, currentValue) {
    let control;
    if (field.type === "textarea") {
      control = node("textarea", "field-control min-h-24 resize-y");
      control.rows = 3;
    } else if (field.type === "select") {
      control = node("select", "field-control");
      const placeholder = node("option", "", "Choose an option");
      placeholder.value = "";
      control.append(placeholder);
      for (const option of field.options || []) {
        const choice = node("option", "", option);
        choice.value = option;
        control.append(choice);
      }
    } else {
      control = node("input", "field-control");
      control.type = field.type === "checkbox" ? "checkbox" : field.type;
      if (field.type === "checkbox") control.className = "h-4 w-4 rounded border-slate-300";
    }
    control.name = field.name;
    control.required = Boolean(field.required);
    if (field.type === "checkbox") {
      control.checked = Boolean(currentValue);
    } else if (currentValue !== undefined && currentValue !== null) {
      control.value = String(currentValue);
    }
    return control;
  }

  function renderScreen() {
    const screen = appSpec.screens.find((item) => item.id === activeScreenId);
    if (!screen) {
      showStatus("The generated application has an invalid screen reference.");
      return;
    }
    hideStatus();
    for (const button of navigation.querySelectorAll("[data-screen]")) {
      const active = button.dataset.screen === activeScreenId;
      button.className = `mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`;
    }

    const rows = readRows(screen);
    screenArea.replaceChildren();
    const screenHeader = node("div", "mb-5 flex flex-wrap items-end justify-between gap-3");
    const heading = node("div");
    heading.append(node("h2", "brand-font text-xl font-extrabold text-slate-900", screen.title));
    heading.append(node("p", "mt-1 text-sm text-slate-500", `${rows.length} ${rows.length === 1 ? screen.entityName.toLowerCase() : `${screen.entityName.toLowerCase()}s`}`));
    const addButton = node("button", `${classNames.button} ${classNames.primary} inline-flex items-center gap-2`);
    addButton.type = "button";
    addButton.append(node("span", "text-base leading-none", "+"), node("span", "", `Add ${screen.entityName}`));
    heading.className = "mr-auto";
    screenHeader.append(heading, addButton);
    screenArea.append(screenHeader);

    const entryPanel = node("form", "mb-5 hidden rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5");
    entryPanel.noValidate = false;
    let editingId = null;
    const panelTitle = node("h3", "mb-4 text-sm font-bold text-slate-800");
    const fieldGrid = node("div", "grid gap-4 sm:grid-cols-2");
    const panelActions = node("div", "mt-5 flex justify-end gap-2");
    const cancelButton = node("button", `${classNames.button} ${classNames.neutral}`, "Cancel");
    cancelButton.type = "button";
    const saveButton = node("button", `${classNames.button} ${classNames.primary}`, "Save");
    saveButton.type = "submit";
    panelActions.append(cancelButton, saveButton);
    entryPanel.append(panelTitle, fieldGrid, panelActions);
    screenArea.append(entryPanel);

    function showEditor(row) {
      editingId = row?.id || null;
      panelTitle.textContent = row ? `Edit ${screen.entityName}` : `New ${screen.entityName}`;
      fieldGrid.replaceChildren();
      for (const field of screen.fields) {
        const wrapper = node("label", field.type === "checkbox" ? "flex items-center gap-2 text-sm font-medium text-slate-700" : "block text-sm font-medium text-slate-700");
        const label = node("span", field.type === "checkbox" ? "order-2" : "mb-1.5 block", field.label);
        const control = fieldControl(field, row?.[field.name]);
        if (field.type === "checkbox") wrapper.append(control, label);
        else wrapper.append(label, control);
        fieldGrid.append(wrapper);
      }
      entryPanel.classList.remove("hidden");
      fieldGrid.querySelector("input,textarea,select")?.focus();
    }

    addButton.addEventListener("click", () => showEditor(null));
    cancelButton.addEventListener("click", () => {
      entryPanel.classList.add("hidden");
      entryPanel.reset();
    });
    entryPanel.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!entryPanel.reportValidity()) return;
      const data = {};
      for (const field of screen.fields) {
        const control = entryPanel.elements.namedItem(field.name);
        data[field.name] = field.type === "checkbox" ? control.checked : control.value.trim();
      }
      const nextRows = editingId
        ? rows.map((row) => row.id === editingId ? { ...row, ...data } : row)
        : [...rows, { id: newRecordId(), ...data }];
      if (saveRows(screen, nextRows)) {
        rows.splice(0, rows.length, ...nextRows);
        renderScreen();
      }
    });

    if (rows.length === 0) {
      const empty = node("div", "rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-5 py-12 text-center");
      empty.append(node("div", "mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-xl text-slate-400 shadow-sm", "＋"));
      empty.append(node("h3", "mt-3 text-sm font-bold text-slate-800", `No ${screen.entityName.toLowerCase()}s yet`));
      empty.append(node("p", "mt-1 text-sm text-slate-500", `Add your first ${screen.entityName.toLowerCase()} to get started.`));
      screenArea.append(empty);
      return;
    }

    const tableWrap = node("div", "overflow-x-auto rounded-xl border border-slate-200");
    const table = node("table", "w-full min-w-[640px] divide-y divide-slate-200 text-left text-sm");
    const thead = node("thead", "bg-slate-50");
    const headerRow = node("tr");
    for (const column of screen.columns) {
      const field = screen.fields.find((item) => item.name === column);
      headerRow.append(node("th", "px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500", field?.label || column));
    }
    headerRow.append(node("th", "px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500", "Actions"));
    thead.append(headerRow);
    const tbody = node("tbody", "divide-y divide-slate-100 bg-white");

    for (const row of rows) {
      const tr = node("tr", "hover:bg-slate-50/70");
      for (const column of screen.columns) {
        const value = row[column];
        const cell = node("td", "max-w-64 truncate px-4 py-3.5 text-slate-700");
        if (typeof value === "boolean") {
          cell.append(node("span", `rounded-full px-2.5 py-1 text-xs font-semibold ${value ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`, value ? "Yes" : "No"));
        } else {
          cell.textContent = value === undefined || value === "" ? "—" : String(value);
        }
        tr.append(cell);
      }
      const actions = node("td", "whitespace-nowrap px-4 py-3 text-right");
      const editButton = node("button", `${classNames.button} ${classNames.neutral} mr-1`, "Edit");
      editButton.type = "button";
      editButton.addEventListener("click", () => showEditor(row));
      const deleteButton = node("button", `${classNames.button} ${classNames.danger}`, "Delete");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`Delete this ${screen.entityName.toLowerCase()}?`)) return;
        const nextRows = rows.filter((item) => item.id !== row.id);
        if (saveRows(screen, nextRows)) {
          rows.splice(0, rows.length, ...nextRows);
          renderScreen();
        }
      });
      actions.append(editButton, deleteButton);
      tr.append(actions);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    tableWrap.append(table);
    screenArea.append(tableWrap);
  }

  renderScreen();
}
