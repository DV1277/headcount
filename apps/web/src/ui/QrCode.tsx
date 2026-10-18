import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';

export function QrCode({ value, size = 128 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    toDataURL(value, { margin: 1, scale: 4, errorCorrectionLevel: 'M' }).then(
      (url) => { if (alive) setSrc(url); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [value]);
  if (failed) return <span className="hc-qr hc-qr--missing" style={{ width: size, height: size }}>QR unavailable</span>;
  if (!src) return <span className="hc-qr hc-qr--pending" style={{ width: size, height: size }} role="img" aria-label="Generating QR code" />;
  return <img className="hc-qr" width={size} height={size} src={src} alt={`QR code linking to ${value}`} />;
}
