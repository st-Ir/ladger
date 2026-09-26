"use client";

import { useLedger } from "@/lib/store";
import type { View } from "@/lib/derive";

export default function ThemeDrawer({ v }: { v: View }) {
  const { closeTheme, setTheme, resetColors, setColor } = useLedger();

  return (
    <>
      {v.themeOpen && <div className="dscrim" onClick={closeTheme} />}
      <aside className="drawer">
        <div className="dhd">
          <h3>Tampilan</h3>
          <button className="xbtn" onClick={closeTheme}>×</button>
        </div>
        <div className="dlbl">Tema</div>
        <div className="themerow">
          {v.themeCards.map((t) => (
            <div className={"tcard " + t.cls} key={t.id} onClick={() => setTheme(t.id as any)}>
              <div className="tprev" style={{ background: t.bg }}>
                <span className="tdot" style={{ background: t.d1 }} />
                <span className="tdot" style={{ background: t.d2 }} />
              </div>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div className="warnhd">
          <div className="dlbl" style={{ margin: 0 }}>Warna — {v.themeName}</div>
          <button className="reset" onClick={resetColors}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset
          </button>
        </div>
        {v.colorRows.map((c) => (
          <div className="crow" key={c.token}>
            <span className="cn">{c.label}</span>
            <span className="ch">{c.hex}</span>
            <input
              className="sw"
              type="color"
              value={c.value}
              onInput={(e) => setColor(c.token, (e.target as HTMLInputElement).value)}
              onChange={(e) => setColor(c.token, (e.target as HTMLInputElement).value)}
            />
          </div>
        ))}
        <div className="dfoot">
          Perubahan langsung diterapkan &amp; tersimpan di browser ini. &quot;Reset&quot; mengembalikan tema ini ke warna bawaan.
        </div>
      </aside>
    </>
  );
}
