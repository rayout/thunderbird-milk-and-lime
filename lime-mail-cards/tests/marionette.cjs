const net = require('node:net');
const assert = require('node:assert/strict');

module.exports = async function connect(port, expectedProfile) {
  assert(expectedProfile && expectedProfile.includes('/lime-cards-test-'), 'Dedicated test profile required');
  port = Number(process.env.THUNDERBIRD_TEST_PORT || port);
  const socket = net.createConnection({host:'127.0.0.1', port});
  let buffer = Buffer.alloc(0), sequence = 0;
  const pending = new Map();
  let helloResolve;
  const hello = new Promise(resolve => { helloResolve=resolve; });
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer,chunk]);
    while (true) {
      const colon=buffer.indexOf(':');
      if(colon<0) break;
      const length=Number(buffer.subarray(0,colon).toString());
      if(buffer.length<colon+1+length) break;
      const message=JSON.parse(buffer.subarray(colon+1,colon+1+length).toString());
      buffer=buffer.subarray(colon+1+length);
      if(!Array.isArray(message)) {helloResolve(message);continue;}
      const item=pending.get(message[1]);
      if(!item) continue;
      pending.delete(message[1]);clearTimeout(item.timer);
      message[2] ? item.reject(new Error(JSON.stringify(message[2]))) : item.resolve(message[3]);
    }
  });
  socket.on('error', error => { for(const p of pending.values()) p.reject(error); });
  const call=(name,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+name));},20000);
    pending.set(id,{resolve,reject,timer});
    const message=JSON.stringify([0,id,name,params]);
    socket.write(Buffer.byteLength(message)+':'+message);
  });
  await Promise.race([hello,new Promise((_,reject)=>{setTimeout(()=>reject(new Error('No Marionette handshake')),10000).unref();})]);
  const session=await call('WebDriver:NewSession',{capabilities:{alwaysMatch:{acceptInsecureCerts:false}}});
  const actual=session.capabilities?.['moz:profile'];
  if(actual!==expectedProfile){socket.destroy();throw Error('Refusing non-test profile: '+actual);}
  await call('Marionette:SetContext',{value:'chrome'});
  return {
    call,
    execute:script=>call('WebDriver:ExecuteScript',{script,args:[],newSandbox:false}),
    executeAsync:script=>call('WebDriver:ExecuteAsyncScript',{script,args:[],newSandbox:false,scriptTimeout:15000}),
    close:async()=>{try{await call('WebDriver:DeleteSession');}finally{socket.destroy();}},
  };
};
