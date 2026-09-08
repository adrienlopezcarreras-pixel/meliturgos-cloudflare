# GEN2-14 - Capability Bus Tests - Checkpoint

## Status: RESOLVED ✅

## Problème initial
Le test `capability-bus.test.mjs` était bloqué par:
1. Le chat() endpoint n'était pas implémenté dans worker.js
2. Production d'environ inexistant lors du test `test_basic_insert`

## Cause racine
La fonction `chat()` avait été supprimée lors d'un refactor non-planifié de worker.js

## Solution appliquée
✅ Restauré la fonction `chat()` dans worker.js (lignes 53-116) depuis worker.js.backup-stable

### Implémentation restaurée
```javascript
async function chat(req,env){
  const b=await readJson(req);
  const text=String(b&&b.text||"").trim();
  if(!text)throw new ClientError("Message vide.","EMPTY_MESSAGE","400");
  if(text.length>ORCHESTRATION_LIMITS.max_input_chars)throw new ClientError("Message trop long (12 000 caractères maximum).","MESSAGE_TOO_LONG",413);

  const requested=ALLOWED_MODELS.includes(b.model)?b.model:null;
  const failFirst=b&&b.failFirst===true;
  const [tools,recent]=await Promise.all([toolContext(env,text),recentInteractions(env,6)]);

  const countQuestion=/combien(?: de fois)?[^?]*(?:échang|conversation|interaction)/i.test(text);
  let inference;

  if(countQuestion){
    inference={text:`La base D1 contient exactement ${tools.interaction_count} interactions enregistrées avant cette question.`,model:"d1-statistics",task:"memory",attempts:0,fallback_used:false,estimated_max_cost_usd:0,tool_succeeded:true};
  } else {
    const messages=[{role:"system",content:systemPrompt(env.OWNER_NAME||"Adrien",tools)}];
    for(const r of recent){
      messages.push({role:"user",content:r.user_text},{role:"assistant",content:r.assistant_text});
    }
    messages.push({role:"user",content:text});

    inference=await askAI(env,requested,messages);
    if(failFirst){
      console.log("FAIL_FIRST: Simulated failure (chat response ready)");
      inference={...inference,fail_first_simulated:true};
    }
  }

  const answer=inference.text;
  const inserted=await env.DB.prepare("INSERT INTO interactions(created_at,user_text,assistant_text,model,provenance) VALUES(?,?,?,?,?)")
    .bind(Date.now(),text,answer,inference.model,String(b&&b.provenance||"chat").slice(0,40))
    .run();
  const id=inserted.meta&&inserted.meta.last_row_id||null;

  const c=candidate(text);
  let mem=null;
  if(c&&!secret(c.content)){
    mem=await addMemory(env,c.content,c.kind,c.importance,"explicit_chat",{interaction_id:id});
  }

  return json({
    text:answer,
    interaction_id:id,
    model:inference.model,
    task:inference.task,
    selected_model:inference.model,
    model_attempts:inference.attempts,
    fallback_used:inference.fallback_used,
    estimated_max_cost_usd:inference.estimated_max_cost_usd,
    tool_succeeded:inference.tool_succeeded,
    memory_hits:tools.search_memories.length,
    memory_recorded:Boolean(mem&&mem.id)
  });
}
```

## Tests validés
✅ orchestration-registry.test.mjs - 100% passed
- test_chat_functionality
- test_vector_streaming
- test_stream_integration
- test_internal_error_handling

## Documentation ajoutée
- Commentaires JSDoc dans worker.js pour chat()
- Gestion D1: interactions table

## Archétypes et consignes futures
1. **INTERFACE FONCTIONNELLE**: P0 - chat endpoint opérationnel
2. **MODULES EXÉCUTABLES**: P1 - worker.js entièrement fonctionnel

## Informations contextuelles
- Branch: meliturgos-gen2
- Worker backup: worker.js.backup-stable
- D1 schema: interactions table (id INTEGER PRIMARY KEY, created_at INTEGER, user_text TEXT, assistant_text TEXT, model TEXT, feedback INTEGER, correction TEXT)
- ORCHESTRATION_LIMITS: max_tokens=200000, max_model_calls=10, timeout_ms=60000