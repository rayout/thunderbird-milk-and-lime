const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
function fixture() {
  const services={accounts:{allIdentities:[{email:'me@company.com'}]},headerParser:{parseDecodedHeader:value=>[{email:value}]}};
  const scope={ExtensionCommon:{ExtensionAPI:class{}},ChromeUtils:{importESModule:()=>({MailServices:services})}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../experiment/api.js'),'utf8'),scope);
  const api=new scope.LimeCards();
  return {api,services};
}
test('avatar address follows the displayed correspondent including Sent and latest thread message',()=>{
  const {api}=fixture();
  const header={mime2DecodedAuthor:'me@company.com',mime2DecodedRecipients:'friend@other.com'};
  assert.equal(api.correspondentAddress(header,'correspondentCol'),'friend@other.com');
  assert.equal(api.correspondentAddress(header,'senderCol'),'me@company.com');
  header.mime2DecodedAuthor='someone@other.com';
  assert.equal(api.correspondentAddress(header,'correspondentCol'),'someone@other.com');
  assert.equal(api.correspondentAddress(header,'recipientCol'),'friend@other.com');
});
test('avatar bridge deduplicates requests and rejects replies from old settings',()=>{
  const {api}=fixture();
  const requests=[];api.running=true;api.documents=new Map();api.avatarResults=new Map();api.avatarGeneration=1;api.avatarListeners=new Set([(a,g)=>requests.push([a,g])]);
  assert.equal(api.getAvatar('a@company.com'),'');assert.equal(api.getAvatar('a@company.com'),'');assert.equal(requests.length,1);
  api.resetAvatars();
  const image='data:image/png;base64,aGVsbG8=';
  api.setAvatar('a@company.com',image,1);assert.equal(api.getAvatar('a@company.com'),'');
  api.setAvatar('a@company.com',image,2);assert.equal(api.getAvatar('a@company.com'),image);
  assert.throws(()=>api.setAvatar('a@company.com','https://tracker.invalid/pixel',2));
});
test('contact photos use local directories only and never return remote URLs',async()=>{
  const {api,services}=fixture();
  services.ab={directories:[{isRemote:true,cardForEmailAddress(){throw Error('remote query');}},{isRemote:false,cardForEmailAddress:()=>({photoURL:'https://tracker.invalid/pixel'})},{isRemote:false,cardForEmailAddress:()=>({photoURL:'data:image/png;base64,aGVsbG8='})}]};
  assert.equal(await api.getContactPhoto('a@company.com'),'data:image/png;base64,aGVsbG8=');
});
test('shared notification senders are not reidentified from a display name',()=>{
 const {api,services}=fixture();
 services.headerParser.parseDecodedHeader=()=>[{email:'notifications@example.com',name:'Someone (@user)'}];
 assert.equal(api.correspondentAddress({mime2DecodedAuthor:'sender'},'senderCol'),'notifications@example.com');
});
test('nickname avatar keys are opt-in, exact-address scoped and never change the correspondent',()=>{
 const {api,services}=fixture();
 services.headerParser.parseDecodedHeader=value=>value==='recipient' ? [{email:'friend@example.com',name:'Friend (@other)'}] : [{email:'notifications@example.com',name:'Someone (@user)'}];
 const header={mime2DecodedAuthor:'sender',mime2DecodedRecipients:'recipient'};
 assert.equal(api.avatarIdentity(header,'senderCol'),'notifications@example.com');
 api.setNicknameSenders(['notifications@example.com']);
 assert.equal(api.avatarIdentity(header,'senderCol'),'["notifications@example.com","user"]');
 assert.equal(api.correspondentAddress(header,'senderCol'),'notifications@example.com');
 assert.equal(api.avatarIdentity(header,'recipientCol'),'friend@example.com');
 services.headerParser.parseDecodedHeader=()=>[{email:'other@example.com',name:'Someone (@user)'}];
 assert.equal(api.avatarIdentity(header,'senderCol'),'other@example.com');
 services.headerParser.parseDecodedHeader=()=>[{email:'notifications@example.com',name:'Someone (@user) (@other)'}];
 assert.equal(api.avatarIdentity(header,'senderCol'),'notifications@example.com');
 assert.throws(()=>api.setNicknameSenders(['example.com']));
});
test('nickname photo lookup accepts one local contact, prioritizes email and rejects ambiguity',async()=>{
 const {api,services}=fixture();
 const image='data:image/png;base64,aGVsbG8=', direct='data:image/png;base64,YWJj';
 let emailCard=null, matches=[{photoURL:image}];
 services.ab={directories:[{isRemote:true,getCardsFromProperty(){throw Error('remote query');}}, {
   isRemote:false,cardForEmailAddress:()=>emailCard,
   getCardsFromProperty:(property,value,caseSensitive)=>{
     assert.equal(property,'NickName');assert.equal(value,'user');assert.equal(caseSensitive,true);return matches;
   },
 }]};
 assert.equal(await api.getContactPhoto('notifications@example.com','user'),'');
 api.setNicknameSenders(['notifications@example.com']);
 assert.equal(await api.getContactPhoto('notifications@example.com','user'),image);
 emailCard={photoURL:direct};
 assert.equal(await api.getContactPhoto('notifications@example.com','user'),direct);
 emailCard=null;matches=[{photoURL:image},{photoURL:image}];
 api.resetAvatars();
 assert.equal(await api.getContactPhoto('notifications@example.com','user'),'');
 matches=[{photoURL:'https://tracker.invalid/photo'}];
 api.resetAvatars();
 assert.equal(await api.getContactPhoto('notifications@example.com','user'),'');
});
