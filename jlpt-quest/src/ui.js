export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  sprout:'M12 21v-9M12 15C4 16 3 9 3 5c6 0 10 3 9 10ZM12 12c0-7 4-10 9-10 0 6-3 10-9 10Z',
  book:'M12 5v15M3 4h4a5 5 0 0 1 5 2 5 5 0 0 1 5-2h4v15h-5a5 5 0 0 0-4 2 5 5 0 0 0-4-2H3Z',
  spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  pen:'m16 3 5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15Z',
  headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h3v9H3a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2ZM21 12h-3v9h3a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Z',
  trophy:'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5M17 5h4v3a5 5 0 0 1-5 5M12 14v7M7 21h10',
  home:'m3 10 9-8 9 8v11h-7v-7h-4v7H3Z',
  refresh:'M3 10a9 9 0 0 1 16-6l2 3M21 3v5h-5M21 14A9 9 0 0 1 5 20l-2-3M3 21v-5h5',
  library:'M3 3h4v18H3ZM10 3h4v18h-4Zm8 0 4 1-3 17-4-1Z',
  chart:'M4 20V10M12 20V4M20 20v-7',
  flame:'M13 2c2 7-5 7-2 12 2 0 4-3 4-5 9 8 4 13-3 13S1 17 5 10c-1 6 4 6 3 2-1-3 2-5 5-10Z',
  bolt:'m14 2-11 12h8l-1 8 11-12h-8Z',
  star:'m12 2 3 6.5 7 1-5 5 1 7-6-3.5-6 3.5 1-7-5-5 7-1Z',
  lock:'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4ZM12 14v4',
  check:'m5 12 5 5L20 7',
  close:'m6 6 12 12M6 18 18 6',
  next:'m9 5 7 7-7 7',
  back:'m15 5-7 7 7 7',
  sound:'m11 4-6 5H2v6h3l6 5ZM16 8a6 6 0 0 1 0 8M19 4a11 11 0 0 1 0 16',
  settings:'M9 3h6l1 4 4 1 2 5-3 3v4l-5 2-3-3-4 1-4-4 2-4-1-4ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  clock:'M12 7v6l4 2M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  flag:'M5 22V2M5 3c5-4 9 4 15 0v10c-6 4-10-4-15 0',
  sun:'M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0',
  chat:'M21 11a9 9 0 0 1-9 9H3v-6a9 9 0 1 1 18-3ZM7 10h10M7 14h6',
  compass:'m15 9-2 4-4 2 2-4ZM22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  search:'m16 16 6 6M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
  eye:'M2 12c5-10 15-10 20 0-5 10-15 10-20 0ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  download:'M12 2v13m-5-5 5 5 5-5M3 17v5h18v-5',
  upload:'M12 17V4m-5 5 5-5 5 5M3 17v5h18v-5',
  undo:'M3 4v6h6M3 10c2-8 17-7 17 3 0 5-5 8-9 7',
  trash:'M3 6h18M8 6V2h8v4M5 6l1 16h12l1-16M10 10v8M14 10v8',
  hand:'M8 13V4a2 2 0 0 1 4 0v8-10a2 2 0 0 1 4 0v10-7a2 2 0 0 1 4 0v11c0 10-11 10-15 4l-4-6a2 2 0 0 1 3-3Z',
  heart:'M12 21 3 12C-4 2 8-2 12 5c4-7 16-3 9 7Z'
};
export function icon(name,cls='') {return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;}
// Original code-native vector mascot; not Duolingo's owl or a third-party asset.
export function mascot(mood='happy',cls='') {return `<svg class="mascot ${cls}" viewBox="0 0 180 180" aria-hidden="true"><ellipse cx="89" cy="162" rx="52" ry="8" fill="#dbe9d5"/><path d="M91 46C64 41 52 16 64 8c22 0 31 19 27 38Z" fill="#51ad34"/><path d="M90 45c-2-24 16-38 37-31-2 23-16 32-37 31Z" fill="#8bd456"/><path d="M36 98C25 66 52 39 90 39s65 27 54 59l-9 28c-7 20-83 20-90 0Z" fill="#ffe38b"/><path d="M45 112c16 15 73 17 92-1l-7 27c-9 18-73 18-82 0Z" fill="#f2c45e"/><ellipse cx="39" cy="107" rx="15" ry="12" transform="rotate(-25 39 107)" fill="#ffe38b"/><ellipse cx="142" cy="102" rx="15" ry="12" transform="rotate(-30 142 102)" fill="#ffe38b"/><ellipse cx="65" cy="151" rx="15" ry="9" fill="#dfaa43"/><ellipse cx="115" cy="151" rx="15" ry="9" fill="#dfaa43"/><ellipse cx="64" cy="85" rx="6" ry="9" fill="#3c4534"/><ellipse cx="114" cy="85" rx="6" ry="9" fill="#3c4534"/><circle cx="66" cy="82" r="2" fill="white"/><circle cx="116" cy="82" r="2" fill="white"/><ellipse cx="52" cy="101" rx="10" ry="6" fill="#f7b183"/><ellipse cx="126" cy="101" rx="10" ry="6" fill="#f7b183"/>${mood==='think'?'<path d="M81 108q8-5 16 0" fill="none" stroke="#624d2a" stroke-width="4" stroke-linecap="round"/>':'<path d="M77 102q12 23 25 0Z" fill="#624d2a"/><path d="M83 111q6-5 13 0" stroke="#eb8c76" stroke-width="5" stroke-linecap="round"/>'}</svg>`;}
export const button = (action,label,cls='primary',extra='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
