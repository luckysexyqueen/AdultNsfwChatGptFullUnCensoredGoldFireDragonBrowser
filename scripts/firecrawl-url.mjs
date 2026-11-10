export function isAllowedPageUrl(input){
 if(typeof input!=='string'||input.length>2048)return false;
 try{const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
 const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.test')||h.endsWith('.example')||h.endsWith('.invalid'))return false;
 if(!h.includes('.')||/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(h)||h.includes(':')||h.endsWith('.onion'))return false;
 return true;}catch{return false;}
}
