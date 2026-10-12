const http = require('node:http');

// API readiness alone does not guarantee that the portable UI still exists.
function read(port, token, route) {
  return new Promise(resolve => {
    const request = http.get({hostname:'127.0.0.1',port,path:route,
      headers:{'X-SynapseX-Token':token},timeout:1000}, response => {
      let body='';
      response.setEncoding('utf8');
      response.on('data', chunk => {body+=chunk;if(body.length>1024*1024)response.destroy();});
      response.on('end',()=>resolve({status:response.statusCode,type:response.headers['content-type']||'',body}));
      response.on('error',()=>resolve(null));
    });
    request.on('timeout',()=>request.destroy());
    request.on('error',()=>resolve(null));
  });
}
async function waitForHost(port, token, timeoutMs=30000) {
  const started=Date.now();
  do {
    const status=await read(port,token,'/api/status');
    if(status?.status===200) {
      const page=await read(port,token,`/?token=${encodeURIComponent(token)}`);
      if(page?.status===200&&/text\/html/i.test(page.type)&&/id=["']root["']/.test(page.body))return;
    }
    await new Promise(resolve=>setTimeout(resolve,180));
  }while(Date.now()-started<timeoutMs);
  throw Error('本地服务或页面资源未就绪，请完全退出软件后重新打开；若仍失败，请重新下载安装包。');
}
module.exports={waitForHost};
