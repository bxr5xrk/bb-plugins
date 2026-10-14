import { fileAppearance } from '../../lib/explorer-model';
export function FileIcon({ name, folder, open }: { name: string; folder?: boolean; open?: boolean }) {
  const appearance = fileAppearance(name);
  return <svg className="pw-file-icon" data-file-kind={folder ? 'folder' : appearance.kind} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: folder ? '#d9b76f' : appearance.color }} aria-hidden="true">
    {folder ? <><path d="M3 7V5h6l2 2h10v13H3Z" fill="currentColor" fillOpacity=".12" />{open && <path d="m3 20 3-10h16l-3 10Z" fill="currentColor" fillOpacity=".2" />}</> : appearance.kind === 'react' ? <><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" /></> : <>
      <path d="M5 3h9l5 5v13H5Z" fill="currentColor" fillOpacity=".07" /><path d="M14 3v5h5" />
      {appearance.kind === 'config' ? <><path d="m9 12-2 3 2 3m6-6 2 3-2 3m-3-6-1 6" /></> : appearance.kind === 'image' ? <><circle cx="9" cy="11" r="1" /><path d="m7 18 4-4 2 2 2-3 2 5" /></> : appearance.kind === 'style' ? <><path d="m10 12-2 3 2 3m4-6 2 3-2 3" /></> : appearance.kind === 'code' ? appearance.letters ? <text x="12" y="17" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif" fontWeight="700" fontSize="8">{appearance.letters}</text> : <path d="m10 12-2 3 2 3m4-6 2 3-2 3" /> : <path d="M8 12h8M8 15h8M8 18h5" />}
    </>}
  </svg>;
}
