(function(){var list=document.querySelector("#capability-list"),button=document.querySelector("#refresh-capabilities");async function refresh(){list.textContent="Chargement…";try{var registry=await api("/api/tools/registry"),lines=registry.tools.map(function(t){return (t.available?"✓":"○")+" "+t.name+" — "+t.effective_status+" — "+t.capability+"
  "+t.explanation});list.textContent=lines.join("

")}catch(e){list.textContent="Registre indisponible : "+e.message}}button.onclick=refresh;refresh()})();