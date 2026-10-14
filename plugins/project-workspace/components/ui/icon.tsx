import {
  experimental_Icon as HostIcon,
  type ExperimentalIconProps,
} from "@get-bb/plugin-sdk/app";

export type IconName = string;
export type IconProps = ExperimentalIconProps;
export function Icon({ name, fallback, ...props }: IconProps) {
  // These familiar glyph names are not part of BB's built-in vocabulary.
  // Render their small SVGs locally instead of accepting the host Zap fallback.
  if (name === "House" || name === "Ellipsis" || name === "FolderGit2" || name === "Branch" || name === "SlidersHorizontal" || name === "Agent") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {name === "House" ? <>
        <path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" />
      </> : name === "Ellipsis" ? <>
        <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
      </> : name === "Agent" ? <>
        <path d="M7 7h10l3 4v8H4v-8Zm5-4v4" /><circle cx="8" cy="13" r="1" /><circle cx="16" cy="13" r="1" /><path d="M9 17h6" />
      </> : name === "Branch" ? <>
        <circle cx="6" cy="5" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10m0-3h5a7 7 0 0 0 7-4" />
      </> : name === "SlidersHorizontal" ? <>
        <path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" />
      </> : <>
        <path d="M3 20h18V6H11L9 4H3Z" /><circle cx="9" cy="11" r="1.5" />
        <circle cx="15" cy="16" r="1.5" /><path d="M9 12.5v4M10.5 11h2A2.5 2.5 0 0 1 15 13.5v1" />
      </>}
    </svg>;
  }
  return <HostIcon name={name} fallback={fallback} {...props} />;
}
