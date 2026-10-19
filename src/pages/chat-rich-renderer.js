export const CHAT_RICH_RENDERER_SOURCE = String.raw`
(function(){
  const BT=String.fromCharCode(96),FENCE=BT.repeat(3);
  const SAFE_PROTOCOLS=new Set(['http:','https:']);

  function safeUrl(raw){
    try{
      const url=new URL(String(raw||''),window.location.href);
      return SAFE_PROTOCOLS.has(url.protocol)?url.href:null;
    }catch{return null}
  }

  function mediaKind(href){
    let url;
    try{url=new URL(href)}catch{return ''}
    if(url.protocol!=='https:')return '';
    const path=url.pathname.toLowerCase();
    const host=url.hostname.toLowerCase();
    if(/\/api\/computer\/v1\/screenshot$/.test(path))return 'image';
    if(/\.(?:png|jpe?g|gif|webp|avif)$/.test(path))return 'image';
    if(/\.(?:mp3|wav|ogg|m4a|flac)$/.test(path))return 'audio';
    if(/\.(?:mp4|webm|ogv)$/.test(path))return 'video';
    if(host==='youtu.be'||host==='youtube.com'||host==='www.youtube.com'||host==='m.youtube.com')return 'youtube';
    if(host==='vimeo.com'||host==='www.vimeo.com'||host==='player.vimeo.com')return 'vimeo';
    return 'page';
  }

  function appendMedia(parent,href,alt){
    const kind=mediaKind(href);
    if(!kind)return false;
    const box=document.createElement('figure');
    box.className='mel-rich-media';
    if(kind==='image'){
      const img=document.createElement('img');
      img.src=href;img.alt=String(alt||'');img.referrerPolicy='no-referrer';img.loading='lazy';
      box.appendChild(img);
    }else if(kind==='audio'){
      const audio=document.createElement('audio');
      audio.controls=true;audio.preload='none';audio.src=href;
      box.appendChild(audio);
    }else if(kind==='video'){
      const video=document.createElement('video');
      video.controls=true;video.preload='metadata';video.playsInline=true;video.src=href;
      box.appendChild(video);
    }else{
      let src=href;
      if(kind==='youtube'){
        const url=new URL(href);
        const raw=url.hostname.toLowerCase()==='youtu.be'?url.pathname.split('/').filter(Boolean)[0]:(url.pathname.startsWith('/embed/')?url.pathname.split('/')[2]:url.searchParams.get('v'));
        const id=String(raw||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,20);
        if(!id)return false;
        src='https://www.youtube-nocookie.com/embed/'+id;
      }else if(kind==='vimeo'){
        const id=String(new URL(href).pathname.split('/').filter(Boolean).pop()||'').replace(/\D/g,'').slice(0,20);
        if(!id)return false;
        src='https://player.vimeo.com/video/'+id;
      }
      const frame=document.createElement('iframe');
      frame.src=src;frame.title=String(alt||new URL(href).hostname);frame.loading='lazy';frame.referrerPolicy='no-referrer';
      frame.setAttribute('sandbox','allow-scripts allow-popups allow-presentation');
      frame.setAttribute('allow','fullscreen; picture-in-picture');
      box.appendChild(frame);
      const caption=document.createElement('a');
      caption.href=href;caption.target='_blank';caption.rel='noopener noreferrer';caption.textContent=String(alt||href);
      box.appendChild(caption);
    }
    parent.appendChild(box);
    return true;
  }

  function appendText(node,value){node.appendChild(document.createTextNode(String(value??'')))}

  function appendInline(parent,value){
    const source=String(value??'');
    const token=/(!\[[^\]\n]*\]\((?:https?:\/\/)[^)\s]+\)|\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\)|https?:\/\/[^\s<]+|\*\*[^*\n]+\*\*|__[^_\n]+__|\x60[^\x60\n]+\x60|~~[^~\n]+~~|\*[^*\n]+\*)/g;
    let cursor=0,match;
    while((match=token.exec(source))){
      if(match.index>cursor)appendText(parent,source.slice(cursor,match.index));
      const raw=match[0];
      if(raw.startsWith('![')){
        const parts=raw.match(/^!\[([^\]\n]*)\]\(([^)\s]+)\)$/);
        const href=parts?safeUrl(parts[2]):null;
        if(href&&!/\.svg(?:$|\?)/i.test(href)){
          const img=document.createElement('img');
          img.className='mel-rich-inline';img.src=href;img.alt=parts[1]||'';img.referrerPolicy='no-referrer';
          parent.appendChild(img);
        }else appendText(parent,raw);
      }else if(raw.startsWith('[')){
        const parts=raw.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
        const href=parts?safeUrl(parts[2]):null;
        if(href){
          const a=document.createElement('a');
          a.href=href;a.target='_blank';a.rel='noopener noreferrer';
          a.textContent=parts[1];parent.appendChild(a);
        }else appendText(parent,raw);
      }else if(/^https?:\/\//i.test(raw)){
        const cleaned=raw.replace(/[.,!?;:]+$/,'');
        const suffix=raw.slice(cleaned.length);
        const href=safeUrl(cleaned);
        if(href){
          const a=document.createElement('a');
          a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=cleaned;
          parent.appendChild(a);
          if(suffix)appendText(parent,suffix);
        }else appendText(parent,raw);
      }else if((raw.startsWith('**')&&raw.endsWith('**'))||(raw.startsWith('__')&&raw.endsWith('__'))){
        const strong=document.createElement('strong');strong.textContent=raw.slice(2,-2);parent.appendChild(strong);
      }else if(raw.charCodeAt(0)===96&&raw.charCodeAt(raw.length-1)===96){
        const code=document.createElement('code');code.textContent=raw.slice(1,-1);parent.appendChild(code);
      }else if(raw.startsWith('~~')&&raw.endsWith('~~')){
        const del=document.createElement('del');del.textContent=raw.slice(2,-2);parent.appendChild(del);
      }else if(raw.startsWith('*')&&raw.endsWith('*')){
        const em=document.createElement('em');em.textContent=raw.slice(1,-1);parent.appendChild(em);
}else appendText(parent,raw);
      cursor=match.index+raw.length;
    }
    if(cursor<source.length)appendText(parent,source.slice(cursor));
  }

  function splitTableRow(line){
    let value=String(line||'').trim();
    if(value.startsWith('|'))value=value.slice(1);
    if(value.endsWith('|'))value=value.slice(0,-1);
    return value.split('|').map(cell=>cell.trim());
  }

  function isTableSeparator(line){
    const cells=splitTableRow(line);
    return cells.length>0&&cells.every(cell=>/^:?-{3,}:?$/.test(cell));
  }

  function isFence(line){
    const value=String(line||'').trimStart();
    return value.startsWith(FENCE)||value.startsWith('~~~');
  }

  function isBlockStart(lines,index){
    const line=String(lines[index]??'');
    if(!line.trim())return true;
    if(isFence(line))return true;
    if(/^\s{0,3}#{1,6}\s+/.test(line))return true;
    if(/^\s{0,3}>\s?/.test(line))return true;
    if(/^\s{0,3}[-*+]\s+/.test(line))return true;
    if(/^\s{0,3}\d+[.)]\s+/.test(line))return true;
    if(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))return true;
    return line.includes('|')&&index+1<lines.length&&isTableSeparator(lines[index+1]);
  }

  function renderRichText(target,value){
    if(!target||typeof target.replaceChildren!=='function')return false;
    const root=document.createElement('div');root.className='mel-rich';
    const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');
    let i=0;

    while(i<lines.length){
      const line=lines[i];
      if(!line.trim()){i++;continue}

      const standalone=String(line).trim();
      const imageLine=standalone.match(/^!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)$/);
      if(imageLine){
        const href=safeUrl(imageLine[2]);
        if(href&&!/\.svg(?:$|\?)/i.test(href)){
          const box=document.createElement('figure');
          box.className='mel-rich-media';
          const img=document.createElement('img');
          img.src=href;img.alt=imageLine[1]||'';img.referrerPolicy='no-referrer';img.loading='lazy';
          box.appendChild(img);
          root.appendChild(box);
          i++;continue;
        }
      }
      const lone=standalone.match(/^(https?:\/\/\S+)$/);
      if(lone){
        const href=safeUrl(lone[1].replace(/[.,!?;:]+$/,''));
        if(href&&appendMedia(root,href,'')){i++;continue}
      }

      if(isFence(line)){
        const trimmed=line.trimStart();
        const marker=trimmed.startsWith(FENCE)?FENCE:'~~~';
        const language=trimmed.slice(marker.length).trim().replace(/[^a-z0-9_+-]/gi,'').slice(0,40);
        const codeLines=[];i++;
        while(i<lines.length&&!String(lines[i]).trimStart().startsWith(marker)){codeLines.push(lines[i]);i++}
        if(i<lines.length)i++;
        const pre=document.createElement('pre'),code=document.createElement('code');
        if(language)code.className='language-'+language.toLowerCase();
        code.textContent=codeLines.join('\n');pre.appendChild(code);root.appendChild(pre);continue;
      }

      const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if(heading){
        const h=document.createElement('h'+heading[1].length);appendInline(h,heading[2]);root.appendChild(h);i++;continue;
      }

      if(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){
        root.appendChild(document.createElement('hr'));i++;continue;
      }

      if(/^\s{0,3}>\s?/.test(line)){
        const quote=document.createElement('blockquote'),parts=[];
        while(i<lines.length&&/^\s{0,3}>\s?/.test(lines[i])){
          parts.push(lines[i].replace(/^\s{0,3}>\s?/,''));i++;
        }
        parts.forEach((part,index)=>{if(index)quote.appendChild(document.createElement('br'));appendInline(quote,part)});
        root.appendChild(quote);continue;
      }

      if(/^\s{0,3}[-*+]\s+/.test(line)||/^\s{0,3}\d+[.)]\s+/.test(line)){
        const ordered=/^\s{0,3}\d+[.)]\s+/.test(line),list=document.createElement(ordered?'ol':'ul');
        const pattern=ordered?/^\s{0,3}\d+[.)]\s+/:/^\s{0,3}[-*+]\s+/;
        while(i<lines.length&&pattern.test(lines[i])){
          const li=document.createElement('li');appendInline(li,lines[i].replace(pattern,''));list.appendChild(li);i++;
        }
        root.appendChild(list);continue;
      }

      if(line.includes('|')&&i+1<lines.length&&isTableSeparator(lines[i+1])){
        const headers=splitTableRow(line),rows=[];i+=2;
        while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){rows.push(splitTableRow(lines[i]));i++}
        const wrap=document.createElement('div');wrap.className='mel-rich-table-wrap';
        const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
        headers.forEach(cell=>{const th=document.createElement('th');appendInline(th,cell);tr.appendChild(th)});
        thead.appendChild(tr);table.appendChild(thead);
        const tbody=document.createElement('tbody');
        rows.forEach(row=>{const r=document.createElement('tr');headers.forEach((_,index)=>{const td=document.createElement('td');appendInline(td,row[index]??'');r.appendChild(td)});tbody.appendChild(r)});
        table.appendChild(tbody);wrap.appendChild(table);root.appendChild(wrap);continue;
      }

      const paragraph=[];
      while(i<lines.length&&lines[i].trim()&&!isBlockStart(lines,i)){paragraph.push(lines[i]);i++}
      if(!paragraph.length){paragraph.push(lines[i]);i++}
      const p=document.createElement('p');
      paragraph.forEach((part,index)=>{if(index)p.appendChild(document.createElement('br'));appendInline(p,part)});
      root.appendChild(p);
    }

    target.replaceChildren(root);
    target.dataset.richRendered='true';
    return true;
  }

  window.melRenderRichText=renderRichText;
})();
`;

export const CHAT_RICH_RENDERER_CSS = String.raw`
.msg.mel{white-space:normal}
.mel-rich{min-width:0;line-height:1.55}
.mel-rich>:first-child{margin-top:0!important}.mel-rich>:last-child{margin-bottom:0!important}
.mel-rich p{margin:.55em 0}.mel-rich h1,.mel-rich h2,.mel-rich h3,.mel-rich h4,.mel-rich h5,.mel-rich h6{margin:1em 0 .45em;line-height:1.2;letter-spacing:-.015em}
.mel-rich h1{font-size:1.45em}.mel-rich h2{font-size:1.28em}.mel-rich h3{font-size:1.14em}.mel-rich h4,.mel-rich h5,.mel-rich h6{font-size:1em}
.mel-rich ul,.mel-rich ol{margin:.55em 0 .65em;padding-left:1.45em}.mel-rich li{margin:.22em 0}
.mel-rich blockquote{margin:.7em 0;padding:.35em .8em;border-left:3px solid currentColor;opacity:.82}
.mel-rich code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;padding:.12em .3em;border-radius:5px;background:rgba(127,127,127,.14)}
.mel-rich pre{margin:.7em 0;padding:.8em .9em;border-radius:10px;overflow:auto;background:rgba(2,6,23,.88);color:#e5eef9;white-space:pre}
.mel-rich pre code{padding:0;background:transparent;color:inherit;font-size:.88em}
.mel-rich a{color:inherit;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.mel-rich hr{border:0;border-top:1px solid currentColor;opacity:.22;margin:.9em 0}
.mel-rich-table-wrap{max-width:100%;overflow-x:auto;margin:.75em 0;border:1px solid rgba(127,127,127,.24);border-radius:9px}
.mel-rich table{border-collapse:collapse;width:100%;min-width:360px;font-size:.92em}.mel-rich th,.mel-rich td{padding:.5em .65em;text-align:left;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.2)}.mel-rich th{font-weight:800;background:rgba(127,127,127,.09)}.mel-rich tbody tr:last-child td{border-bottom:0}
.mel-rich-media{margin:.7em 0;max-width:100%}
.mel-rich-media img,.mel-rich-media video,.mel-rich-media iframe{display:block;width:100%;max-width:100%;border:0;border-radius:10px;background:rgba(0,0,0,.25)}
.mel-rich-media img,.mel-rich-media video{height:auto}
.mel-rich-media iframe{height:360px}
.mel-rich-media audio{width:100%}
.mel-rich-media a{display:inline-block;margin-top:.35em;overflow-wrap:anywhere}
.mel-rich img.mel-rich-inline{max-width:100%;height:auto;border-radius:8px;vertical-align:middle}
`;
