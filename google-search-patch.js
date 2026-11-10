/* GoldFireDragon Google Japan search URL adapter; browser-safe, no Node require or credential injection. */
(function(global){
  'use strict';
  const defaults={num:'15',gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0',tbs:'li:1',near:'Tokyo',gcr:'jp'};
  function buildGoogleSearchURL(query,{lucky=false,authuser}={}){
    const url=new URL('https://www.google.co.jp/search');
    url.searchParams.set('q',String(query??'').trim());
    for(const [key,value] of Object.entries(defaults))url.searchParams.set(key,value);
    if(lucky)url.searchParams.set('btnI','1');
    if(authuser!==undefined && /^\d{1,2}$/.test(String(authuser)))url.searchParams.set('authuser',String(authuser));
    return url.href;
  }
  global.GFDGooglePatch=Object.freeze({buildGoogleSearchURL});
})(window);
