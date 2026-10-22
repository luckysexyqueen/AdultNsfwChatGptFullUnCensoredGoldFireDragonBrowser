export async function onRequestGet() {
  return Response.json({available:true,mode:'cloudflare-pages-functions',tunnel:false,configured:false,region:'JP',language:'ko-KR',expectedEgressCountry:'JP',deploymentRegion:'cloudflare-edge',japanEgressVerified:false}, {headers:{'Cache-Control':'no-store'}});
}
