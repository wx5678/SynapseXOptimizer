// Read-only game inspection. Writes only a derived, non-account report to stdout.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root='D:/game/游戏蜗牛/9yinjh';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const wanted=/^(?:camera_|max_camera|mouse_response|inv_y|lock_camera|ui_scale|head_zoom|self_effect|other_effect|enemy_effect|priority_skill|show_range_buff|fight_|right_motionblur|right_movieeffect|movie_animation|open_movie_scene|open_animation|show_buff_time|fix_buff_time|keep_delay|start_keep|speedattack|fightparry|grass_|shadow_|water_|effect_quality|texture_quality|anisotropic|bloom_|screen_blur|dof_|volume_lighting|hdr_|ssao_|prelight_|foliage_|weather_|physics_|visual_radius|virtual_object_count|max_display_fps|sound_|music_|area_music|windowed|vsync|wide_angle|multisample|hardware_accel|fxaa_)/i;
const inventory={};let configFiles=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(e.isSymbolicLink()||['log','reverse_analysis','patch','_DLSS5_Backup','backup_opt_20260815'].includes(e.name))continue;
 const file=path.join(dir,e.name);if(e.isDirectory())walk(file);
 else if(/\.(ini|cfg|xml|conf|json|lua)$/i.test(e.name)){configFiles++;const name=/^[\w.-]+$/.test(e.name)?e.name:'[角色或加密命名配置]';inventory[name]=(inventory[name]||0)+1;}
}}
walk(root);
const loose={};for(const name of ['system_set.ini','systeminfo.ini']){
 const file=path.join(root,'bin64',name),b=fs.readFileSync(file);
 loose[name]={sha256:hash(b),settings:b.toString('latin1').split(/\r?\n/).flatMap((line,i)=>{const m=line.match(/^([^=]+)=(.*)$/);return m&&wanted.test(m[1])?[{key:m[1],value:m[2],line:i+1}]:[]})};
}
const packages=[];
for(const name of ['ini.package','map_ini.package','skin.package']){
 const file=path.join(root,'res',name),data=fs.readFileSync(file),before=hash(data),matches=[];let blocks=0,errors=0;
 const start=data.readUInt32LE(14);if(data.subarray(0,4).toString()!=='PCK0'||start<19||start>data.length)throw Error('Unexpected package');
 for(let offset=start;offset<data.length-2;){
  if(data[offset]!==0x78||((data[offset]<<8)+data[offset+1])%31){offset++;continue;}
  try{const r=zlib.inflateSync(data.subarray(offset),{info:true,maxOutputLength:16*1024*1024});if(!r.engine.bytesWritten)throw Error('empty');
   const text=new TextDecoder('gbk').decode(r.buffer),keys=[...text.matchAll(/^([A-Za-z_][\w.]*)\s*=/gm)].map(m=>m[1]).filter(k=>wanted.test(k));
   const special=[...new Set((text.match(/\b(?:trigger_action_speed|PlaySpeed|SetBlendActionSpeed|CameraShake|camera_shake|camera_fov|fov|MaxVisible|DrawDistance)\b/gi)||[]))];
   if(keys.length||special.length)matches.push({offset,bytes:r.buffer.length,keys:[...new Set(keys)],special,sections:(text.match(/^\[[^\r\n\]]{1,70}\]/gm)||[]).slice(0,4)});
   blocks++;offset+=r.engine.bytesWritten;
  }catch{errors++;offset++;}
 }
 packages.push({name,size:data.length,sha256:before,indexEntries:data.readUInt32LE(10),recoveredBlocks:blocks,rejectedZlibHeaders:errors,activeIndexResolved:false,matches,unchanged:hash(fs.readFileSync(file))===before});
}
console.log(JSON.stringify({configFiles,inventory,loose,packages},null,2));
