import { useEffect, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { selectExecutable } from '../lib/executablePicker';
import { userError } from '../lib/userError';

export function ExecutablePickerButton({onSelect,onError,disabled=false,className='workbench-secondary',label='浏览 EXE'}:{
  onSelect:(path:string)=>void|Promise<void>;onError:(message:string)=>void;
  disabled?:boolean;className?:string;label?:string;
}) {
  const [pending,setPending]=useState(false);
  const picking=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const picker=window.synapsexDesktop?.selectGameExecutable;
  return <button type="button" className={className} disabled={disabled||pending||!picker}
    title={picker?'选择 .exe 文件；不会自动应用设置':'请在桌面客户端中浏览文件，也可手动粘贴路径'}
    onClick={async()=>{
      if(picking.current||disabled||!picker)return;
      picking.current=true;setPending(true);
      try { await selectExecutable(picker,path=>{if(alive.current)return onSelect(path);}); }
      catch(error){if(alive.current)onError(userError(error));}
      finally{picking.current=false;if(alive.current)setPending(false);}
    }}><FolderOpen size={15} className="mr-2 inline" aria-hidden="true"/>{pending?'选择中…':label}</button>;
}
