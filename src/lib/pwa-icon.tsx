import { ImageResponse } from 'next/og';

// Home-screen icon drawn in code so no binary asset is needed. iOS applies its own rounded mask,
// so the square is painted edge to edge.
export function pwaIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1454e6',
        color: '#ffffff',
        fontSize: size * 0.4,
        fontWeight: 800,
        letterSpacing: size * -0.01,
      }}
    >
      ABT
    </div>,
    { width: size, height: size },
  );
}
