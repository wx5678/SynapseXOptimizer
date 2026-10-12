import {MembershipCenter} from './MembershipCenter';
import {AppearancePanel} from './AppearancePanel';
import './workspace-top-actions.css';

export function WorkspaceTopActions({connected}:{connected:boolean}) {
  return <div className="workspace-top-actions" role="group" aria-label="账号与工作台工具">
    <span className={`toolbar-connection ${connected?'is-connected':''}`} role="status" title={connected?'本地优化服务已连接':'本地优化服务未连接，部分功能暂不可用'}>
      <span className="toolbar-connection-dot" aria-hidden="true"/>
      <span>{connected?'服务已连接':'服务未连接'}</span>
    </span>
    <MembershipCenter tools={<AppearancePanel/>}/>
  </div>;
}
