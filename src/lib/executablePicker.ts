export async function selectExecutable(
  picker: (() => Promise<string>) | undefined,
  onSelect: (path: string) => void | Promise<void>,
): Promise<boolean> {
  if (!picker) throw new Error('请在桌面客户端中浏览文件，也可以直接粘贴完整路径。');
  const selected = await picker();
  if (!selected) return false; // Cancel must preserve the existing path and preview.
  if (!/\.exe$/i.test(selected)) throw new Error('请选择游戏或程序的 .exe 文件，而不是文件夹或快捷方式。');
  await onSelect(selected);
  return true;
}
