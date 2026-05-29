import type { ReactNode, CSSProperties } from 'react';

// AftertaleFrame — wraps children in the brand's 9-slice gold-on-violet
// frame. CSS does the heavy lifting via border-image; this component is a
// thin wrapper so callers don't repeat the class + inner-padding pattern.
//
// The source PNG lives at /frame/aftertale-9slice-frame.png. If the file
// is missing the border-image is a no-op (renders the transparent border),
// so the layout still works — just unframed — until the asset is dropped in.

interface AftertaleFrameProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  // Override the displayed frame thickness (default 32px).
  thickness?: number;
}

export function AftertaleFrame({ children, className, style, thickness }: AftertaleFrameProps) {
  const merged: CSSProperties = thickness
    ? { ...style, ['--at-frame-thickness' as string]: `${thickness}px` }
    : (style ?? {});
  return (
    <div className={`at-aftertale-frame${className ? ' ' + className : ''}`} style={merged}>
      <div className="at-aftertale-frame-content">{children}</div>
    </div>
  );
}
