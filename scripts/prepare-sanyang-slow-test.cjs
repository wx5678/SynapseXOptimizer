// One-setting local experiment. Generates verified backup/candidate; never writes the game.
const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const target='D:/game/游戏蜗牛/9yinjh/res/ini.package';
const root=path.resolve(__dirname,'../state/animation-speed-test');
const expected='265d4b526f50be3e9ca182360dfe60b9da5e2d1e4a71296f76c4f4e0c02af4a0';
const offset=12548923,length=433641;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(fs.realpathSync(target).toLowerCase(),path.resolve(target).toLowerCase());
const before=fs.readFileSync(target);assert.equal(hash(before),expected);assert.equal(before.length,20578406);
const read=b=>z.inflateSync(b.subarray(offset,offset+length),{info:true,maxOutputLength:4*1024*1024});
const original=read(before);assert.equal(original.engine.bytesWritten,length);assert.equal(original.buffer.length,3111370);
const text=original.buffer.toString('latin1');
const sections=[...text.matchAll(/^\[CS_em_jdmz02\]\r\n[\s\S]*?(?=^\[)/gm)];assert.equal(sections.length,1);
const section=sections[0],old='trigger_custom_5=1;trigger_action_speed;18; ,0.5,fight_0h_jb_10';
assert.equal(section[0].split(old).length,2);
assert(section[0].includes('trigger_custom_6=1;trigger_action_speed;30; ,1,fight_0h_jb_10'));
const changed=Buffer.from(text.slice(0,section.index)+section[0].replace(old,old.replace('0.5','0.2'))+text.slice(section.index+section[0].length),'latin1');
const differences=[];for(let i=0;i<changed.length;i++)if(changed[i]!==original.buffer[i])differences.push(i);
assert.equal(changed.length,original.buffer.length);assert.equal(differences.length,1);
assert.equal(original.buffer[differences[0]],53);assert.equal(changed[differences[0]],50);
function adler(b){let a=1,c=0;for(let i=0;i<b.length;i++){a=(a+b[i])%65521;c=(c+a)%65521;}const out=Buffer.alloc(4);out.writeUInt32BE(((c<<16)|a)>>>0);return out;}
let block,compression;
// Z_SYNC_FLUSH ends at a byte boundary without ending the stream. Empty stored
// blocks produce no output; a final stored/fixed block completes a valid stream.
// This preserves indexed compressed length without trailing junk or index edits.
outer:for(const level of [6,7,8,9])for(let memLevel=5;memLevel<=9;memLevel++){
 const raw=z.deflateRawSync(changed,{level,memLevel,finishFlush:z.constants.Z_SYNC_FLUSH});
 for(const end of [Buffer.from([1,0,0,255,255]),Buffer.from([3,0])]){
  const gap=length-2-raw.length-end.length-4;if(gap<0||gap%5)continue;
  const padding=Buffer.alloc(gap);for(let i=0;i<gap;i+=5)Buffer.from([0,0,0,255,255]).copy(padding,i);
  block=Buffer.concat([Buffer.from([0x78,0x9c]),raw,padding,end,adler(changed)]);
  compression={level,memLevel,emptyStoredBlocks:gap/5,finalBlockBytes:end.length};break outer;
 }
}
assert(block,'Could not preserve compressed length; no game writes');assert.equal(block.length,length);
const candidate=Buffer.from(before);block.copy(candidate,offset);
assert(before.subarray(0,offset).equals(candidate.subarray(0,offset)));
assert(before.subarray(offset+length).equals(candidate.subarray(offset+length)));
const verified=read(candidate);assert.equal(verified.engine.bytesWritten,length);assert(verified.buffer.equals(changed));
assert.equal(hash(fs.readFileSync(target)),expected);
fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'sanyang-'));
fs.writeFileSync(path.join(directory,'ini.package.original'),before,{flag:'wx'});
fs.writeFileSync(path.join(directory,'ini.package.candidate'),candidate,{flag:'wx'});
assert.equal(hash(fs.readFileSync(path.join(directory,'ini.package.original'))),expected);
assert.equal(hash(fs.readFileSync(path.join(directory,'ini.package.candidate'))),hash(candidate));
const manifest={target,directory,originalHash:expected,candidateHash:hash(candidate),offset,length,decodedLength:changed.length,changedDecodedOffsets:differences,skill:'CS_em_jdmz02',setting:old,before:'0.5',after:'0.2',restoreValue:'1',compression,activeIndexResolved:false,runtimeEffectVerified:false,createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));
