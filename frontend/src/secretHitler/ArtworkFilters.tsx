import {inkPalettes} from './artwork';
import type {InkPalette} from './artwork';
import './artwork.css';

export function ArtworkFilters() {
  return <svg className="sh-art-filters" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>{(Object.keys(inkPalettes) as InkPalette[]).map(name => {
      const table = (channel: number) => inkPalettes[name].map(color => (color[channel] / 255).toFixed(6)).join(' ');
      return <filter key={name} id={`sh-art-${name}`} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncR type="table" tableValues={table(0)}/>
          <feFuncG type="table" tableValues={table(1)}/>
          <feFuncB type="table" tableValues={table(2)}/>
        </feComponentTransfer>
      </filter>;
    })}</defs>
  </svg>;
}
