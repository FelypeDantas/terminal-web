let state={path:"", root:"", view:"home", items:[], sort:"name", highlights:{}, favorites:{}};
const $=id=>document.getElementById(id);
const colors=[["red","Vermelho","#dc4646"],["orange","Laranja","#eb912d"],["yellow","Amarelo","#e4c72e"],["green","Verde","#4baf5f"],["blue","Azul","#417dd2"],["purple","Roxo","#915abe"],["cyan","Ciano","#37afb9"],["gray","Cinza","#787d87"]];

async function api(url,opts){const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw new Error(d.error||"Erro");return d}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function loadLocal(){try{state.highlights=JSON.parse(localStorage.getItem("explus_highlights")||"{}");state.favorites=JSON.parse(localStorage.getItem("explus_favorites")||"{}")}catch{}}
function saveLocal(){localStorage.setItem("explus_highlights",JSON.stringify(state.highlights));localStorage.setItem("explus_favorites",JSON.stringify(state.favorites))}
function fmtDate(x){if(!x)return"";return new Date(x).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}
function iconFor(i){return i.type==="folder"?"📁":i.type==="drive"?"💽":"📄"}

async function loadRoots(){
 const d=await api("/api/roots"); $("roots").innerHTML=d.roots.map(r=>`<button class="nav root" data-root="${esc(r.path)}">💻 <span>${esc(r.name)}</span></button>`).join("");
 document.querySelectorAll(".root").forEach(b=>b.onclick=()=>openPath(b.dataset.root));
}
async function openPath(path){
 try{const d=await api("/api/list?path="+encodeURIComponent(path));state.path=d.path;state.root=d.root;state.items=d.items;render();}catch(e){alert(e.message)}
}
function renderBreadcrumbs(){
 const p=state.path||"";
 $("breadcrumbs").innerHTML=p?`<span class="crumb current" title="${esc(p)}">${esc(p)}</span>`:"Início";
}
function filtered(){
 let a=[...state.items];
 if(state.view==="favorites")a=a.filter(i=>state.favorites[i.path]);
 if(state.view==="highlights")a=a.filter(i=>state.highlights[i.path]);
 const q=$("searchInput").value.trim().toLowerCase();
 if(q)a=a.filter(i=>i.name.toLowerCase().includes(q));
 a.sort((x,y)=>x.name.localeCompare(y.name,"pt-BR",{numeric:true,sensitivity:"base"}));
 return a;
}
function render(){
 renderBreadcrumbs();
 const a=filtered(),q=$("searchInput").value.trim();
 $("status").textContent=q?`${a.length} resultado(s) para “${q}”`:`${a.length} item(ns)`;
 if(!a.length){$("results").innerHTML=`<div class="empty"><strong>${q?"Nada encontrado":"Pasta vazia"}</strong>${q?"Tente outro termo ou pesquise em toda a rede.":""}</div>`;return}
 $("results").innerHTML=`<div class="grid">${a.map(i=>{
   const h=state.highlights[i.path],fav=!!state.favorites[i.path];
   return `<div class="item" data-path="${esc(i.path)}" data-type="${i.type}">
      <div class="item-icon" ${h?`style="filter:saturate(1.1)"`:""}>${iconFor(i)}</div>
      <div class="item-info"><div class="item-name">${h?`<span class="color-dot" style="background:${colors.find(c=>c[0]===h)?.[2]||"#888"}"></span>`:""}${esc(i.name)}</div>
      <div class="item-meta">${i.type==="folder"?"Pasta":i.type==="file"?"Arquivo":"Unidade"}${i.modified?" · "+fmtDate(i.modified):""}</div></div>
      <button class="fav ${fav?"on":""}" title="Favorito">${fav?"★":"☆"}</button>
    </div>`}).join("")}</div>`;
 document.querySelectorAll(".item").forEach(el=>{
   el.onclick=e=>{if(e.target.closest(".fav"))return; const i=state.items.find(x=>x.path===el.dataset.path); if(i?.type==="folder"||i?.type==="drive")openPath(i.path);};
   el.oncontextmenu=e=>{e.preventDefault(); const i=state.items.find(x=>x.path===el.dataset.path); if(i?.type==="folder")highlightModal(i)};
 });
 document.querySelectorAll(".fav").forEach(b=>b.onclick=e=>{e.stopPropagation();const p=b.closest(".item").dataset.path;state.favorites[p]=!state.favorites[p];if(!state.favorites[p])delete state.favorites[p];saveLocal();render()});
}
function highlightModal(i){
 $("modalTitle").textContent="🎨 Destacar pasta";
 $("modalBody").innerHTML=`<div style="font-size:12px;color:#555;word-break:break-all">${esc(i.name)}<br><small>${esc(i.path)}</small></div>
 <div class="color-grid">${colors.map(c=>`<button class="color-choice" data-color="${c[0]}"><span class="dot" style="background:${c[2]}"></span>${c[1]}</button>`).join("")}</div>
 <div class="modal-row"><button id="removeHighlight">Remover destaque</button><button id="cancelHighlight">Cancelar</button></div>`;
 $("modal").classList.remove("hidden");
 document.querySelectorAll(".color-choice").forEach(b=>b.onclick=()=>{state.highlights[i.path]=b.dataset.color;saveLocal();$("modal").classList.add("hidden");render()});
 $("removeHighlight").onclick=()=>{delete state.highlights[i.path];saveLocal();$("modal").classList.add("hidden");render()};
 $("cancelHighlight").onclick=()=>$("modal").classList.add("hidden");
}
$("closeModal").onclick=()=>$("modal").classList.add("hidden");
$("modal").onclick=e=>{if(e.target.id==="modal")$("modal").classList.add("hidden")};
$("refreshBtn").onclick=()=>state.path&&openPath(state.path);
$("upBtn").onclick=async()=>{if(!state.path)return;const d=await api("/api/up?path="+encodeURIComponent(state.path));openPath(d.path)};
$("searchInput").oninput=render;
$("clearSearch").onclick=()=>{$("searchInput").value="";render()};
$("searchInput").addEventListener("input",()=>$("clearSearch").classList.toggle("hidden",!$("searchInput").value));
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("searchInput").focus()}});
document.querySelectorAll(".nav[data-view]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.view=b.dataset.view;render()});
$("chooseRootBtn").onclick=async()=>{const p=prompt("Digite o caminho da pasta ou da rede (ex.: C:\\\\Projetos ou \\\\servidor\\\\setor):");if(p)openPath(p)};
$("newFolderBtn").onclick=async()=>{if(!state.path)return;const n=prompt("Nome da nova pasta:");if(!n)return;try{await api("/api/mkdir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:state.path,name:n})});openPath(state.path)}catch(e){alert(e.message)}};
$("settingsBtn").onclick=()=>alert("V1: favoritos e destaques ficam salvos neste navegador. A próxima versão pode incluir regras automáticas, busca recursiva, tags e permissões.");
loadLocal();loadRoots();openPath("");
