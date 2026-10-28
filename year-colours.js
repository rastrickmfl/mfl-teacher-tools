/* year-colours.js: v1.90 recolours a .pptx to its year group's three colours when it is dropped into the Library.
   window.YearColours = { paletteFor(folder), recolourDeck(file, palette) }. Works on a copy: the file you dropped is not changed.
   Palettes are the year-group colours (dark / middle / light) plus a gold set for decks that are not in a year folder.
   What changes (theme-linked colours follow the theme, hard-coded ones are mapped):
   - Theme colours and the master background: Light for the background, Middle for shapes and outlines, Dark for emphasis.
   - Red text and outlines (FF0000) become Dark. Yellow highlights become the year's fluorescent colour; yellow fills become Middle.
   - Black or white text on a dark fill flips so it stays readable. Body text stays black.
   - Mostly-green pictures (the Waypoint) have their hue turned to the year's Middle colour.
   What stays as it is: objective slides (El objetivo / L'objectif: their flag colours are kept on a pale grey background), the
   IN, & and ON letters of IN&ON, other hard-coded colours, and pictures that are not mostly green.
   Turn it off with localStorage sv_year_colours = 'off'. */
(function(){
  'use strict';
  const PALETTES = {
    'Year 7':  { name:'Year 7',  dark:'5F7F24', mid:'A8CC52', light:'F1F7E2', fluor:'BFFF3F' },
    'Year 8':  { name:'Year 8',  dark:'07515F', mid:'086F84', light:'E3F2F5', fluor:'3FE0FF' },
    'Year 9':  { name:'Year 9',  dark:'78134F', mid:'7A2D52', light:'F3EDEF', fluor:'FFFF00', soft:0.38 }, // softer than the school's B21C7D / F8E7F1: pale tints of it came out hot pink
    'Year 10': { name:'Year 10', dark:'402347', mid:'61366B', light:'F0EAF3', fluor:'C67BFF' },
    'Year 11': { name:'Year 11', dark:'333333', mid:'404040', light:'EEEEEE', fluor:'FFFF00' },
    gold:      { name:'gold',    dark:'8C6516', mid:'D5A12E', light:'FBF1D8', fluor:'FFD93A' }
  };
  const OBJECTIVE_BG = 'F2F2F2';
  const ORIG_SCHEME = { accent1:'4472C4', accent2:'ED7D31', accent3:'A5A5A5', accent4:'FFC000', accent5:'5B9BD5', accent6:'70AD47', tx2:'44546A', bg2:'E7E6E6' };

  const isOn = ()=>{ try{ return localStorage.getItem('sv_year_colours')!=='off'; }catch(e){ return true; } };
  const hexRgb = h=>[parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  const rgbHex = (r,g,b)=>[r,g,b].map(v=>Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
  function toHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2, d = mx-mn;
    if(!d) return [0, 0, l];
    const s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    let h = mx===r ? (g-b)/d + (g<b ? 6 : 0) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4;
    return [h*60, s, l];
  }
  function fromHsl(h, s, l){
    if(!s) return [l*255, l*255, l*255];
    const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q, k = h/360;
    const f = t=>{ if(t<0) t++; if(t>1) t--; return t<1/6 ? p+(q-p)*6*t : t<0.5 ? q : t<2/3 ? p+(q-p)*(2/3-t)*6 : p; };
    return [f(k+1/3)*255, f(k)*255, f(k-1/3)*255];
  }
  const lumOf = hex=>{ const [r,g,b] = hexRgb(hex).map(v=>{ v /= 255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };

  // The year palette for a Library folder ("Year 7/1 - Autumn 1" gives Year 7); anything else gets gold.
  function paletteFor(folder){
    const top = String(folder || '').split('/')[0];
    return PALETTES[top] || PALETTES.gold;
  }

  // A palette may set soft (0 to 1): the most saturated its theme accent colours can be, so the pale tints PowerPoint makes of them
  // (Lighter 40% and so on) come out dusty rather than hot. The solid dark / middle colours used directly are not touched.
  function accentHex(P, hex){
    if(!P.soft) return hex;
    const [h, s, l] = toHsl(...hexRgb(hex));
    return s>P.soft ? rgbHex(...fromHsl(h, P.soft, l)) : hex;
  }
  // ---------- colours of a fill, for the contrast check ----------
  function schemeHex(P, k){
    switch(k){
      case 'accent1': case 'accent4': case 'accent5': return accentHex(P, P.mid);
      case 'accent2': case 'accent6': return accentHex(P, P.dark);
      case 'dk2': case 'tx2': case 'hlink': case 'folHlink': return P.dark;
      case 'accent3': case 'lt2': case 'bg2': return P.light;
      case 'tx1': case 'dk1': return '000000';
      case 'bg1': case 'lt1': return 'FFFFFF';
    }
    return null;
  }
  // First solid fill in a chunk of xml (lines removed first) as a hex, with lumMod / lumOff applied.
  function fillHex(P, xml){
    const m = /<a:solidFill>\s*<a:(srgbClr|schemeClr) val="(\w+)"\s*(?:\/>|>(.*?)<\/a:\1>)/s.exec(xml.replace(/<a:(ln|lnL|lnR|lnT|lnB|lnTlToBr|lnBlToTr)\b[^>]*?(?:\/>|>.*?<\/a:\1>)/gs, ''));
    if(!m) return null;
    let hex = m[1]==='srgbClr' ? m[2].toUpperCase() : schemeHex(P, m[2]);
    if(!hex || !/^[0-9A-F]{6}$/.test(hex)) return null;
    const mods = m[3] || '', lm = /<a:lumMod val="(\d+)"/.exec(mods), lo = /<a:lumOff val="(\d+)"/.exec(mods);
    if(lm || lo){
      const [h, s, l] = toHsl(...hexRgb(hex)), nl = Math.min(1, Math.max(0, l*(lm ? lm[1]/1e5 : 1) + (lo ? lo[1]/1e5 : 0)));
      hex = rgbHex(...fromHsl(h, s, nl));
    }
    return hex;
  }
  const WHITE_FILL = '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>';
  // Black / inherited text inside a dark shape or table cell becomes white. Text with its own colour is left alone.
  function whitenRuns(xml){
    return xml.replace(/<a:r>(.*?)<\/a:r>/gs, (all, inner)=>{
      const rp = /<a:rPr\b[^>]*?(?:\/>|>.*?<\/a:rPr>)/s.exec(inner);
      if(!rp) return `<a:r><a:rPr lang="en-GB">${WHITE_FILL}</a:rPr>${inner}</a:r>`;
      const r = rp[0], fill = /<a:solidFill>\s*<a:(?:srgbClr|schemeClr|prstClr|sysClr) val="(\w+)"/.exec(r);
      let out;
      if(!fill){
        if(/<a:(?:noFill|gradFill|pattFill|blipFill|grpFill)\b/.test(r)) return all;
        out = r.endsWith('/>') ? r.slice(0, -2) + '>' + WHITE_FILL + '</a:rPr>' : r.replace(/^(<a:rPr\b[^>]*>)(<a:ln\b.*?<\/a:ln>)?/s, '$1$2' + WHITE_FILL);
      }else if(/^(tx1|dk1|000000|black|windowText)$/i.test(fill[1])){
        out = r.replace(/<a:solidFill>.*?<\/a:solidFill>/s, WHITE_FILL);
      }else return all;
      return `<a:r>${inner.replace(r, out)}</a:r>`;
    });
  }
  function fixContrast(P, xml){
    const dark = hex=>hex && lumOf(hex) < 0.3;
    xml = xml.replace(/<p:sp>.*?<\/p:sp>/gs, sp=>{
      const pr = /<p:spPr\b.*?<\/p:spPr>/s.exec(sp);
      return pr && dark(fillHex(P, pr[0])) ? whitenRuns(sp) : sp;
    });
    return xml.replace(/<a:tc\b.*?<\/a:tc>/gs, tc=>{
      const pr = /<a:tcPr\b.*?<\/a:tcPr>/s.exec(tc);
      return pr && dark(fillHex(P, pr[0])) ? whitenRuns(tc) : tc;
    });
  }

  // ---------- the xml rules ----------
  const slideText = xml=>[...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]).join('');
  const isObjective = xml=>/objetivo|objectif/i.test(slideText(xml));
  function themeScheme(P){
    return `<a:clrScheme name="Year group"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${P.dark}"/></a:dk2><a:lt2><a:srgbClr val="${P.light}"/></a:lt2><a:accent1><a:srgbClr val="${accentHex(P, P.mid)}"/></a:accent1><a:accent2><a:srgbClr val="${accentHex(P, P.dark)}"/></a:accent2><a:accent3><a:srgbClr val="${P.light}"/></a:accent3><a:accent4><a:srgbClr val="${accentHex(P, P.mid)}"/></a:accent4><a:accent5><a:srgbClr val="${accentHex(P, P.mid)}"/></a:accent5><a:accent6><a:srgbClr val="${accentHex(P, P.dark)}"/></a:accent6><a:hlink><a:srgbClr val="${P.dark}"/></a:hlink><a:folHlink><a:srgbClr val="${P.dark}"/></a:folHlink></a:clrScheme>`;
  }
  const solidBg = hex=>`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  const setBg = (xml, hex)=>xml.replace(/<p:bg>.*?<\/p:bg>/s, '').replace(/(<p:cSld\b[^>]*>)/, '$1' + solidBg(hex));

  // An objective slide keeps the colours it had before the theme changed, on a pale grey background.
  function keepObjective(xml){
    for(const [k, hex] of Object.entries(ORIG_SCHEME)){
      xml = xml.replace(new RegExp(`<a:schemeClr val="${k}">(.*?)</a:schemeClr>`, 'gs'), `<a:srgbClr val="${hex}">$1</a:srgbClr>`);
      xml = xml.split(`<a:schemeClr val="${k}"/>`).join(`<a:srgbClr val="${hex}"/>`);
    }
    return setBg(xml, OBJECTIVE_BG);
  }
  // Marks the IN, & and ON runs so the colour rules below skip them (the mark is taken off again at the end).
  function markInOn(xml){
    if(!/IN<\/a:t>/.test(xml)) return xml;
    return xml.replace(/<a:r>.*?<\/a:r>/gs, r=>/^(IN|ON|&amp;|&)$/.test((/<a:t>([^<]*)<\/a:t>/.exec(r) || [])[1] || '') ? r.replace(/srgbClr val="(\w{6})"/g, 'srgbClr val="@@$1"') : r);
  }
  // Shapes whose text has "EfL+" or "Support:" (the yellow support boxes) keep their own fill and outline: theme colours in the
  // shape's properties and style become the original colours, then the shape properties are set aside (kept[]) until the rules have run.
  const KEEP_TEXT = /EfL\+|Support:/i;
  function keepSupportShapes(xml, kept){
    const toOrig = s=>{
      for(const [k, hex] of Object.entries(Object.assign({ dk2:'44546A', lt2:'E7E6E6' }, ORIG_SCHEME))){
        s = s.replace(new RegExp(`<a:schemeClr val="${k}">(.*?)</a:schemeClr>`, 'gs'), `<a:srgbClr val="${hex}">$1</a:srgbClr>`).split(`<a:schemeClr val="${k}"/>`).join(`<a:srgbClr val="${hex}"/>`);
      }
      return s;
    };
    return xml.replace(/<p:sp>.*?<\/p:sp>/gs, sp=>{
      if(!KEEP_TEXT.test(slideText(sp))) return sp;
      sp = sp.replace(/<p:style>.*?<\/p:style>/s, toOrig);
      return sp.replace(/<p:spPr\b.*?<\/p:spPr>/s, pr=>{ kept.push(toOrig(pr)); return `<!--KEEP${kept.length - 1}-->`; });
    });
  }
  function recolourXml(name, xml, P){
    if(/^ppt\/theme\/[^/]+\.xml$/.test(name)) return xml.replace(/<a:clrScheme\b.*?<\/a:clrScheme>/s, themeScheme(P));
    const slide = /^ppt\/slides\/[^/]+\.xml$/.test(name);
    if(slide && isObjective(xml)) return keepObjective(xml);
    const kept = [];
    if(slide) xml = markInOn(keepSupportShapes(xml, kept));
    xml = xml.replace(/(<a:highlight>\s*)<a:srgbClr val="FFFF00"/g, `$1<a:srgbClr val="@@${P.fluor}"`)
             .split('srgbClr val="FFFF00"').join(`srgbClr val="${P.mid}"`)
             .split('srgbClr val="FF0000"').join(`srgbClr val="${P.dark}"`)
             .split('srgbClr val="FFF2CC"').join(`srgbClr val="${P.light}"`)
             .split('srgbClr val="D8D0E2"').join(`srgbClr val="${P.light}"`)
             .split('srgbClr val="@@').join('srgbClr val="');
    if(/^ppt\/slideMasters\/[^/]+\.xml$/.test(name)) xml = /<p:bg>/.test(xml) ? xml.replace(/<p:bg>.*?<\/p:bg>/s, solidBg(P.light)) : xml.replace(/(<p:cSld\b[^>]*>)/, '$1' + solidBg(P.light));
    if(kept.length) xml = xml.replace(/<!--KEEP(\d+)-->/g, (m, i)=>kept[Number(i)]);
    if(slide) xml = fixContrast(P, xml);
    return xml;
  }

  // ---------- green pictures ----------
  // A picture counts as green art when most of its coloured pixels are green and it uses few distinct colours (so photos are left).
  async function turnGreenPicture(blob, P){
    const bmp = await createImageBitmap(blob);
    if(bmp.width*bmp.height > 6e6 || bmp.width < 40) return null;
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d', { willReadFrequently:true }); cx.drawImage(bmp, 0, 0);
    const img = cx.getImageData(0, 0, cv.width, cv.height), px = img.data, n = px.length/4;
    let opaque = 0, coloured = 0, green = 0, hueSum = 0, satSum = 0; const seen = new Set();
    for(let i=0;i<px.length;i+=4){
      if(px[i+3]<200) continue; opaque++;
      seen.add((px[i]>>4)<<8 | (px[i+1]>>4)<<4 | (px[i+2]>>4));
      const [h, s, l] = toHsl(px[i], px[i+1], px[i+2]);
      if(s<0.25 || l<0.15 || l>0.92) continue;
      coloured++;
      if(h>=60 && h<=150){ green++; hueSum += h; satSum += s; }
    }
    if(!opaque || coloured < opaque*0.04 || green < coloured*0.6 || seen.size > 900) return null;
    const [mh, ms] = toHsl(...hexRgb(P.mid)), delta = mh - hueSum/green, grey = ms < 0.1, satCap = Math.max(P.soft ? Math.min(ms*1.25, P.soft) : ms*1.25, 0.25); // a muted year colour gives muted pictures
    if(!grey && Math.abs(delta)<12) return null;
    for(let i=0;i<px.length;i+=4){
      if(px[i+3]<8) continue;
      const [h, s, l] = toHsl(px[i], px[i+1], px[i+2]);
      if(s<0.15) continue;
      const [r, g, b] = fromHsl((h+delta+360)%360, grey ? 0 : Math.min(satCap, s*0.9), l);
      px[i] = r; px[i+1] = g; px[i+2] = b;
    }
    cx.putImageData(img, 0, 0);
    const jpg = /^image\/jpe?g/.test(blob.type);
    return await new Promise(res=>cv.toBlob(res, jpg ? 'image/jpeg' : 'image/png', 0.92));
  }

  // Recolours a copy of the deck. On any problem the deck comes back as it was.
  async function recolourDeck(file, P, force){
    if(!P || (!force && !isOn()) || typeof JSZip==='undefined') return file;
    try{
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const part = /^ppt\/(slides|slideLayouts|slideMasters|theme)\/[^/]+\.xml$/;
      let changed = 0;
      for(const name of Object.keys(zip.files)){
        if(!part.test(name)) continue;
        const xml = await zip.file(name).async('string'), out = recolourXml(name, xml, P);
        if(out!==xml){ zip.file(name, out); changed++; }
      }
      for(const name of Object.keys(zip.files)){
        const m = /^ppt\/media\/[^/]+\.(png|jpe?g)$/i.exec(name); if(!m) continue;
        try{
          const type = /png/i.test(m[1]) ? 'image/png' : 'image/jpeg';
          const out = await turnGreenPicture(new Blob([await zip.file(name).async('arraybuffer')], { type }), P);
          if(out){ zip.file(name, out); changed++; }
        }catch(e){ console.warn('Skipped picture', name, e); }
      }
      if(!changed) return file;
      return new File([await zip.generateAsync({ type:'blob', compression:'DEFLATE' })], file.name, { type:file.type });
    }catch(e){ console.error(e); return file; }
  }

  window.YearColours = { paletteFor, recolourDeck, recolourXml, PALETTES };
})();
