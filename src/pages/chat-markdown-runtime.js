export const CHAT_MARKDOWN_RUNTIME_SOURCE = String.raw`
(function(){
  function appendInline(parent, raw){
    const text=String(raw??'');
    const pattern=/(\`[^\`\n]+\`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;
    let cursor=0;
    for(const match of text.matchAll(pattern)){
      if(match.index>cursor) parent.appendChild(document.createTextNode(text.slice(cursor,match.index)));
      const token=match[0];
      if(token.startsWith('\`')){
        const code=document.createElement('code');code.textContent=token.slice(1,-1);parent.appendChild(code);
      }else if(token.startsWith('**')){
        const strong=document.createElement('strong');strong.textContent=token.slice(2,-2);parent.appendChild(strong);
      }else if(token.startsWith('*')){
        const em=document.createElement('em');em.textContent=token.slice(1,-1);parent.appendChild(em);
      }else{
        const parts=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href=parts?.[2]||'';
        if(/^(?:https?:\/\/|mailto:)/i.test(href)){
          const a=document.createElement('a');a.textContent=parts?.[1]||href;a.href=href;
          if(/^https?:\/\//i.test(href)){a.target='_blank';a.rel='noopener noreferrer'}
          parent.appendChild(a);
        }else parent.appendChild(document.createTextNode(token));
      }
      cursor=match.index+token.length;
    }
    if(cursor<text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function splitCells(line){
    return String(line||'').trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());
  }

  function isTableDivider(line){
    const cells=splitCells(line);
    return cells.length>1 && cells.every(cell=>/^:?-{3,}:?$/.test(cell.replace(/\s+/g,'')));
  }

  function appendTable(root, lines, start){
    const headers=splitCells(lines[start]);
    const table=document.createElement('table');
    const thead=document.createElement('thead'),tr=document.createElement('tr');
    headers.forEach(value=>{const th=document.createElement('th');appendInline(th,value);tr.appendChild(th)});
    thead.appendChild(tr);table.appendChild(thead);
    const tbody=document.createElement('tbody');
    let i=start+2;
    while(i<lines.length && /\|/.test(lines[i]) && String(lines[i]).trim()){
      const row=document.createElement('tr');
      splitCells(lines[i]).forEach(value=>{const td=document.createElement('td');appendInline(td,value);row.appendChild(td)});
      tbody.appendChild(row);i++;
    }
    table.appendChild(tbody);
    const wrap=document.createElement('div');wrap.className='md-table-wrap';wrap.appendChild(table);root.appendChild(wrap);
    return i;
  }

  window.melRenderMarkdown=function(target, value){
    if(!target) return;
    target.replaceChildren();
    target.classList.add('md-content');
    const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');
    let paragraph=[],list=null,listType='',quote=null,code=null,codeLines=[];

    const flushParagraph=()=>{
      if(!paragraph.length)return;
      const p=document.createElement('p');appendInline(p,paragraph.join(' '));target.appendChild(p);paragraph=[];
    };
    const flushList=()=>{list=null;listType=''};
    const flushQuote=()=>{quote=null};
    const flushCode=()=>{
      if(!code)return;
      code.textContent=codeLines.join('\n');codeLines=[];code=null;
    };
    const flushAll=()=>{flushParagraph();flushList();flushQuote();flushCode()};

    for(let i=0;i<lines.length;){
      const line=lines[i],trim=line.trim();
      if(code){
        if(/^\`\`\`/.test(trim)){flushCode();i++;continue}
        codeLines.push(line);i++;continue;
      }
      if(/^\`\`\`/.test(trim)){
        flushParagraph();flushList();flushQuote();
        const pre=document.createElement('pre');code=document.createElement('code');
        const lang=trim.slice(3).trim();if(lang)code.dataset.language=lang.slice(0,40);
        pre.appendChild(code);target.appendChild(pre);i++;continue;
      }
      if(!trim){flushParagraph();flushList();flushQuote();i++;continue}

      if(i+1<lines.length && /\|/.test(line) && isTableDivider(lines[i+1])){
        flushParagraph();flushList();flushQuote();i=appendTable(target,lines,i);continue;
      }

      const heading=line.match(/^\s*(#{1,4})\s+(.+)$/);
      if(heading){
        flushParagraph();flushList();flushQuote();
        const h=document.createElement('h'+Math.min(4,heading[1].length+1));appendInline(h,heading[2]);target.appendChild(h);i++;continue;
      }

      const bullet=line.match(/^\s*[-*]\s+(.+)$/);
      const ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
      if(bullet||ordered){
        flushParagraph();flushQuote();
        const type=ordered?'ol':'ul';
        if(!list||listType!==type){flushList();list=document.createElement(type);listType=type;target.appendChild(list)}
        const li=document.createElement('li');appendInline(li,(ordered||bullet)[1]);list.appendChild(li);i++;continue;
      }

      const quoted=line.match(/^\s*>\s?(.*)$/);
      if(quoted){
        flushParagraph();flushList();
        if(!quote){quote=document.createElement('blockquote');target.appendChild(quote)}
        const p=document.createElement('p');appendInline(p,quoted[1]);quote.appendChild(p);i++;continue;
      }

      flushList();flushQuote();paragraph.push(trim);i++;
    }
    flushAll();
    if(!target.childNodes.length) target.textContent=String(value??'');
  };
})();
`;
