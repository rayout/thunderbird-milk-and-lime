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
