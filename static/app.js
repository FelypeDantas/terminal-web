/* =========================================================
   Explorer+
   Gerenciador de arquivos para navegador
   Compatível com Chrome / Edge

   Responsabilidades:
   - Navegação por pastas
   - Busca
   - Favoritos
   - Destaques
   - Ordenação
   - Criação de pastas
   - Persistência local
   ========================================================= */


/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const CONFIG = {
    storageKeys: {
        favorites: "explus_favorites",
        highlights: "explus_highlights",
        root: "explus_root"
    },

    colors: [
        { id: "red",    name: "Vermelho", hex: "#dc4646" },
        { id: "orange", name: "Laranja",  hex: "#eb912d" },
        { id: "yellow", name: "Amarelo",  hex: "#e4c72e" },
        { id: "green",  name: "Verde",    hex: "#4baf5f" },
        { id: "blue",   name: "Azul",     hex: "#417dd2" },
        { id: "purple", name: "Roxo",     hex: "#915abe" },
        { id: "cyan",   name: "Ciano",    hex: "#37afb9" },
        { id: "gray",   name: "Cinza",    hex: "#787d87" }
    ]
};


/* =========================================================
   ESTADO DA APLICAÇÃO
   ========================================================= */

const state = {
    rootHandle: null,
    currentHandle: null,

    rootName: "",
    currentPath: [],

    view: "home",
    sort: "name",

    items: [],

    favorites: {},
    highlights: {},

    isLoading: false
};


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[char];
    });
}

function formatDate(date) {
    if (!date) return "";

    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(new Date(date));
    } catch {
        return "";
    }
}

function getColor(colorId) {
    return CONFIG.colors.find(color => color.id === colorId);
}

function getItemIcon(item) {
    if (item.kind === "directory") return "📁";
    return "📄";
}

function isDirectory(item) {
    return item.kind === "directory";
}

function isFavorite(path) {
    return Boolean(state.favorites[path]);
}

function getHighlight(path) {
    return state.highlights[path] || null;
}


/* =========================================================
   PERSISTÊNCIA
   ========================================================= */

function loadLocalData() {
    try {
        state.favorites = JSON.parse(
            localStorage.getItem(CONFIG.storageKeys.favorites) || "{}"
        );

        state.highlights = JSON.parse(
            localStorage.getItem(CONFIG.storageKeys.highlights) || "{}"
        );
    } catch (error) {
        console.warn("Não foi possível carregar dados locais.", error);

        state.favorites = {};
        state.highlights = {};
    }
}


function saveLocalData() {
    try {
        localStorage.setItem(
            CONFIG.storageKeys.favorites,
            JSON.stringify(state.favorites)
        );

        localStorage.setItem(
            CONFIG.storageKeys.highlights,
            JSON.stringify(state.highlights)
        );
    } catch (error) {
        console.error("Erro ao salvar dados locais:", error);
    }
}


/* =========================================================
   FILE SYSTEM ACCESS API
   ========================================================= */

function supportsFileSystemAccess() {
    return "showDirectoryPicker" in window;
}


async function requestDirectory() {
    if (!supportsFileSystemAccess()) {
        showError(
            "Seu navegador não suporta acesso direto a pastas. " +
            "Use o Google Chrome ou Microsoft Edge."
        );

        return null;
    }

    try {
        const handle = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        return handle;
    } catch (error) {
        if (error.name === "AbortError") {
            return null;
        }

        console.error(error);

        showError("Não foi possível acessar a pasta.");
        return null;
    }
}


async function verifyPermission(handle, write = false) {
    if (!handle) return false;

    const options = {
        mode: write ? "readwrite" : "read"
    };

    try {
        if ((await handle.queryPermission(options)) === "granted") {
            return true;
        }

        if ((await handle.requestPermission(options)) === "granted") {
            return true;
        }
    } catch (error) {
        console.error("Erro de permissão:", error);
    }

    return false;
}


/* =========================================================
   ABRIR PASTA
   ========================================================= */

async function chooseRoot() {
    const handle = await requestDirectory();

    if (!handle) return;

    const allowed = await verifyPermission(handle, true);

    if (!allowed) {
        showError("Permissão para acessar a pasta foi negada.");
        return;
    }

    state.rootHandle = handle;
    state.currentHandle = handle;

    state.rootName = handle.name;
    state.currentPath = [];

    updateRootStorage(handle);
    await loadCurrentDirectory();
}


async function loadCurrentDirectory() {
    if (!state.currentHandle) {
        renderEmptyState(
            "Nenhuma pasta selecionada",
            "Escolha uma pasta para começar."
        );

        return;
    }

    setLoading(true);

    try {
        const items = [];

        for await (const [name, handle] of state.currentHandle.entries()) {
            const item = {
                name,
                kind: handle.kind,
                handle,
                path: buildLogicalPath(name)
            };

            if (handle.kind === "file") {
                try {
                    const file = await handle.getFile();

                    item.size = file.size;
                    item.modified = file.lastModified;
                    item.extension = getExtension(name);
                } catch {
                    item.size = 0;
                }
            }

            items.push(item);
        }

        state.items = items;

        render();
    } catch (error) {
        console.error(error);

        showError(
            "Não foi possível ler o conteúdo desta pasta."
        );
    } finally {
        setLoading(false);
    }
}


/* =========================================================
   CAMINHO LÓGICO
   ========================================================= */

function buildLogicalPath(name = "") {
    const parts = [
        state.rootName,
        ...state.currentPath,
        name
    ].filter(Boolean);

    return parts.join("/");
}


function getCurrentLogicalPath() {
    return [
        state.rootName,
        ...state.currentPath
    ].filter(Boolean).join("/");
}


/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

async function openDirectory(item) {
    if (!item || !isDirectory(item)) return;

    const allowed = await verifyPermission(
        item.handle,
        true
    );

    if (!allowed) {
        showError("Permissão negada para esta pasta.");
        return;
    }

    state.currentHandle = item.handle;

    state.currentPath.push(item.name);

    await loadCurrentDirectory();
}


async function goBack() {
    if (!state.rootHandle) return;

    if (state.currentPath.length === 0) {
        return;
    }

    state.currentPath.pop();

    let handle = state.rootHandle;

    try {
        for (const folderName of state.currentPath) {
            handle = await handle.getDirectoryHandle(folderName);
        }

        state.currentHandle = handle;

        await loadCurrentDirectory();
    } catch (error) {
        console.error(error);

        showError(
            "Não foi possível voltar para a pasta anterior."
        );
    }
}


async function goHome() {
    if (!state.rootHandle) return;

    state.currentHandle = state.rootHandle;
    state.currentPath = [];

    await loadCurrentDirectory();
}


/* =========================================================
   BREADCRUMBS
   ========================================================= */

function renderBreadcrumbs() {
    const container = $("breadcrumbs");

    if (!container) return;

    if (!state.rootHandle) {
        container.textContent = "Início";
        return;
    }

    const parts = [
        {
            name: state.rootName,
            index: -1
        },

        ...state.currentPath.map((name, index) => ({
            name,
            index
        }))
    ];

    container.innerHTML = parts
        .map((part, index) => {
            const isLast = index === parts.length - 1;

            return `
                <button
                    class="crumb ${isLast ? "current" : ""}"
                    data-index="${part.index}"
                    type="button"
                >
                    ${escapeHTML(part.name)}
                </button>
                ${!isLast ? `<span class="crumb-separator">›</span>` : ""}
            `;
        })
        .join("");

    container
        .querySelectorAll(".crumb")
        .forEach(button => {
            button.addEventListener("click", () => {
                navigateToBreadcrumb(
                    Number(button.dataset.index)
                );
            });
        });
}


async function navigateToBreadcrumb(index) {
    if (!state.rootHandle) return;

    if (index === -1) {
        await goHome();
        return;
    }

    const targetPath = state.currentPath.slice(
        0,
        index + 1
    );

    let handle = state.rootHandle;

    try {
        for (const folderName of targetPath) {
            handle = await handle.getDirectoryHandle(folderName);
        }

        state.currentHandle = handle;
        state.currentPath = targetPath;

        await loadCurrentDirectory();
    } catch (error) {
        console.error(error);

        showError(
            "Não foi possível acessar essa localização."
        );
    }
}


/* =========================================================
   FILTRO E BUSCA
   ========================================================= */

function getFilteredItems() {
    let items = [...state.items];

    if (state.view === "favorites") {
        items = items.filter(item =>
            isFavorite(item.path)
        );
    }

    if (state.view === "highlights") {
        items = items.filter(item =>
            Boolean(getHighlight(item.path))
        );
    }

    const searchInput = $("searchInput");

    const query = searchInput
        ? searchInput.value.trim().toLocaleLowerCase("pt-BR")
        : "";

    if (query) {
        items = items.filter(item =>
            item.name
                .toLocaleLowerCase("pt-BR")
                .includes(query)
        );
    }

    return sortItems(items);
}


/* =========================================================
   ORDENAÇÃO
   ========================================================= */

function sortItems(items) {
    return items.sort((a, b) => {
        switch (state.sort) {
            case "name":
                return a.name.localeCompare(
                    b.name,
                    "pt-BR",
                    {
                        numeric: true,
                        sensitivity: "base"
                    }
                );

            case "type":
                return a.kind.localeCompare(b.kind);

            case "date":
                return (b.modified || 0) - (a.modified || 0);

            case "size":
                return (b.size || 0) - (a.size || 0);

            default:
                return 0;
        }
    });
}


/* =========================================================
   RENDERIZAÇÃO
   ========================================================= */

function render() {
    renderBreadcrumbs();

    const items = getFilteredItems();

    renderStatus(items);
    renderItems(items);
}


function renderStatus(items) {
    const status = $("status");

    if (!status) return;

    const searchInput = $("searchInput");

    const query = searchInput
        ? searchInput.value.trim()
        : "";

    if (query) {
        status.textContent =
            `${items.length} resultado(s) para “${query}”`;

        return;
    }

    status.textContent =
        `${items.length} item(ns)`;
}


function renderItems(items) {
    const results = $("results");

    if (!results) return;

    if (!items.length) {
        const searchInput = $("searchInput");

        const query = searchInput
            ? searchInput.value.trim()
            : "";

        renderEmptyState(
            query ? "Nada encontrado" : "Pasta vazia",
            query
                ? "Tente outro termo de pesquisa."
                : "Não existem itens nesta pasta."
        );

        return;
    }

    results.innerHTML = `
        <div class="grid">
            ${items.map(renderItem).join("")}
        </div>
    `;

    bindItemEvents();
}


function renderItem(item) {
    const highlight = getHighlight(item.path);
    const favorite = isFavorite(item.path);
    const color = getColor(highlight);

    const typeLabel = item.kind === "directory"
        ? "Pasta"
        : "Arquivo";

    const meta = [
        typeLabel,
        item.modified
            ? formatDate(item.modified)
            : ""
    ]
        .filter(Boolean)
        .join(" · ");

    return `
        <article
            class="item"
            data-path="${escapeHTML(item.path)}"
        >
            <div class="item-icon">
                ${getItemIcon(item)}
            </div>

            <div class="item-info">
                <div class="item-name">
                    ${
                        color
                            ? `
                                <span
                                    class="color-dot"
                                    style="background:${color.hex}"
                                    title="${escapeHTML(color.name)}"
                                ></span>
                            `
                            : ""
                    }

                    ${escapeHTML(item.name)}
                </div>

                <div class="item-meta">
                    ${escapeHTML(meta)}
                </div>
            </div>

            <button
                class="fav ${favorite ? "on" : ""}"
                type="button"
                title="${favorite ? "Remover favorito" : "Adicionar favorito"}"
                aria-label="${favorite ? "Remover favorito" : "Adicionar favorito"}"
            >
                ${favorite ? "★" : "☆"}
            </button>
        </article>
    `;
}


/* =========================================================
   EVENTOS DOS ITENS
   ========================================================= */

function bindItemEvents() {
    document
        .querySelectorAll(".item")
        .forEach(element => {

            const path = element.dataset.path;

            const item = state.items.find(
                currentItem => currentItem.path === path
            );

            if (!item) return;

            element.addEventListener("dblclick", async () => {
                if (isDirectory(item)) {
                    await openDirectory(item);
                }
            });


            element.addEventListener("contextmenu", event => {
                event.preventDefault();

                if (isDirectory(item)) {
                    openHighlightModal(item);
                }
            });


            const favoriteButton =
                element.querySelector(".fav");

            if (favoriteButton) {
                favoriteButton.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();

                        toggleFavorite(item.path);
                    }
                );
            }
        });
}


/* =========================================================
   FAVORITOS
   ========================================================= */

function toggleFavorite(path) {
    if (isFavorite(path)) {
        delete state.favorites[path];
    } else {
        state.favorites[path] = true;
    }

    saveLocalData();

    render();
}


/* =========================================================
   DESTAQUES
   ========================================================= */

function openHighlightModal(item) {
    const modal = $("modal");

    if (!modal) return;

    $("modalTitle").textContent =
        "🎨 Destacar pasta";

    $("modalBody").innerHTML = `
        <div class="highlight-info">
            <strong>
                ${escapeHTML(item.name)}
            </strong>

            <small>
                ${escapeHTML(item.path)}
            </small>
        </div>

        <div class="color-grid">
            ${CONFIG.colors
                .map(color => `
                    <button
                        class="color-choice"
                        type="button"
                        data-color="${color.id}"
                    >
                        <span
                            class="dot"
                            style="background:${color.hex}"
                        ></span>

                        ${escapeHTML(color.name)}
                    </button>
                `)
                .join("")}
        </div>

        <div class="modal-row">
            <button
                id="removeHighlight"
                type="button"
            >
                Remover destaque
            </button>

            <button
                id="cancelHighlight"
                type="button"
            >
                Cancelar
            </button>
        </div>
    `;

    modal.classList.remove("hidden");

    modal
        .querySelectorAll(".color-choice")
        .forEach(button => {
            button.addEventListener("click", () => {
                setHighlight(
                    item.path,
                    button.dataset.color
                );

                closeModal();
            });
        });


    $("removeHighlight").onclick = () => {
        removeHighlight(item.path);

        closeModal();
    };


    $("cancelHighlight").onclick = closeModal;
}


function setHighlight(path, color) {
    state.highlights[path] = color;

    saveLocalData();

    render();
}


function removeHighlight(path) {
    delete state.highlights[path];

    saveLocalData();

    render();
}


function closeModal() {
    $("modal")?.classList.add("hidden");
}


/* =========================================================
   NOVA PASTA
   ========================================================= */

async function createFolder() {
    if (!state.currentHandle) {
        showError("Selecione uma pasta primeiro.");
        return;
    }

    const name = prompt(
        "Nome da nova pasta:"
    );

    if (!name) return;

    const cleanName = name.trim();

    if (!cleanName) return;

    try {
        const allowed = await verifyPermission(
            state.currentHandle,
            true
        );

        if (!allowed) {
            showError(
                "Você não possui permissão para criar pastas aqui."
            );

            return;
        }

        await state.currentHandle.getDirectoryHandle(
            cleanName,
            {
                create: true
            }
        );

        await loadCurrentDirectory();

    } catch (error) {
        console.error(error);

        showError(
            "Não foi possível criar a pasta. " +
            "Verifique se o nome é válido."
        );
    }
}


/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function getExtension(filename) {
    const parts = filename.split(".");

    if (parts.length < 2) {
        return "";
    }

    return parts.pop().toLowerCase();
}


function setLoading(loading) {
    state.isLoading = loading;

    const status = $("status");

    if (!status) return;

    if (loading) {
        status.textContent =
            "Carregando...";
    }
}


function renderEmptyState(title, description = "") {
    const results = $("results");

    if (!results) return;

    results.innerHTML = `
        <div class="empty">
            <strong>
                ${escapeHTML(title)}
            </strong>

            ${
                description
                    ? `<span>${escapeHTML(description)}</span>`
                    : ""
            }
        </div>
    `;
}


function showError(message) {
    console.error(message);

    alert(message);
}


/* =========================================================
   ARMAZENAMENTO DA PASTA
   ========================================================= */

function updateRootStorage(handle) {
    /*
     * O FileSystemDirectoryHandle não pode ser salvo
     * diretamente no localStorage.
     *
     * Nesta V1 guardamos apenas o nome da última pasta.
     *
     * Na próxima etapa podemos usar IndexedDB para
     * persistir o handle da pasta.
     */

    try {
        localStorage.setItem(
            CONFIG.storageKeys.root,
            handle.name
        );
    } catch {
        // Ignorar falhas de armazenamento
    }
}


/* =========================================================
   EVENTOS GLOBAIS
   ========================================================= */

function setupEvents() {

    /* Atualizar */

    $("refreshBtn")?.addEventListener(
        "click",
        () => {
            if (state.currentHandle) {
                loadCurrentDirectory();
            }
        }
    );


    /* Configurações */

    $("settingsBtn")?.addEventListener(
        "click",
        () => {
            alert(
                "Explorer+ V1\n\n" +
                "Favoritos e destaques são salvos " +
                "neste navegador."
            );
        }
    );


    /* Selecionar pasta */

    $("chooseRootBtn")?.addEventListener(
        "click",
        chooseRoot
    );


    /* Nova pasta */

    $("newFolderBtn")?.addEventListener(
        "click",
        createFolder
    );


    /* Subir */

    $("upBtn")?.addEventListener(
        "click",
        goBack
    );


    /* Busca */

    $("searchInput")?.addEventListener(
        "input",
        () => {
            render();

            $("clearSearch")
                ?.classList
                .toggle(
                    "hidden",
                    !$("searchInput").value
                );
        }
    );


    /* Limpar busca */

    $("clearSearch")?.addEventListener(
        "click",
        () => {
            $("searchInput").value = "";

            $("clearSearch")
                .classList
                .add("hidden");

            render();

            $("searchInput").focus();
        }
    );


    /* Atalhos */

    document.addEventListener(
        "keydown",
        event => {

            /* Ctrl + K */

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();

                $("searchInput")?.focus();

                return;
            }


            /* Escape */

            if (event.key === "Escape") {
                closeModal();
            }
        }
    );


    /* Navegação lateral */

    document
        .querySelectorAll(".nav[data-view]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".nav[data-view]")
                        .forEach(item => {
                            item.classList.remove("active");
                        });

                    button.classList.add("active");

                    state.view =
                        button.dataset.view;

                    render();
                }
            );
        });


    /* Modal */

    $("closeModal")?.addEventListener(
        "click",
        closeModal
    );


    $("modal")?.addEventListener(
        "click",
        event => {
            if (event.target === $("modal")) {
                closeModal();
            }
        }
    );
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function init() {

    loadLocalData();

    setupEvents();

    if (!supportsFileSystemAccess()) {
        renderEmptyState(
            "Navegador não compatível",
            "Abra o Explorer+ no Google Chrome ou Microsoft Edge."
        );

        return;
    }

    renderEmptyState(
        "Bem-vindo ao Explorer+",
        "Selecione uma pasta para começar."
    );
}


init();
