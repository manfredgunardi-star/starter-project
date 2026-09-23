import { useRef, useState } from 'react';
import { Button } from 'antd';

export default function TombolAksi({ onClick, children, ...props }) {
  const [sibuk, setSibuk] = useState(false);
  const kunci = useRef(false);
  async function klik(e) {
    if (kunci.current) return;
    kunci.current = true;
    setSibuk(true);
    try {
      await onClick?.(e);
    } catch {
      // error sudah ditampilkan oleh pemanggil (useRpc / message)
    } finally {
      kunci.current = false;
      setSibuk(false);
    }
  }
  return <Button {...props} loading={sibuk} onClick={klik}>{children}</Button>;
}
