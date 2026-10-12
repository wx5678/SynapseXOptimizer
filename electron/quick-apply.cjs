// Dedicated preset execution boundary. Manual settings retain their own policy.
// Never accept arbitrary routes, scripts or a caller-provided permission name.
const basicIds = new Set(['game-mode','disable-game-capture','quiet-gamebar','mmcss-game-priority']);
function prepareQuickApply(value, requireVip) {
  if (!value || !['basic','optimal','maximum'].includes(value.tier) ||
      !['system','advanced','expert'].includes(value.kind) ||
      typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value.id)) throw Error('无效的一键优化项目，请重新检测。');
  if (value.tier === 'basic') {
    if (value.kind !== 'system' || !basicIds.has(value.id)) throw Error('此项目不属于基础方案。');
  } else requireVip(`quick.${value.tier}`);
  let route, body;
  if (value.kind === 'system') {
    route='/api/system/apply';body={ids:[value.id],confirmation:'APPLY'};
  } else if (value.kind === 'advanced') {
    route='/api/system/advanced/apply';body={id:value.id,confirmation:'APPLY'};
  } else {
    if (typeof value.fingerprint !== 'string' || !value.fingerprint || value.fingerprint.length > 512 ||
        typeof value.choice !== 'string' || value.choice.length > 128) throw Error('参数已失效，请重新检测后再应用。');
    route='/api/system/expert/apply';body={id:value.id,fingerprint:value.fingerprint,choice:value.choice,confirmation:'APPLY'};
  }
  return {path:route,method:'POST',body:JSON.stringify(body)};
}
module.exports={prepareQuickApply};
