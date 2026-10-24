import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import crownStyles from './style.css?url';
import './portal.css';
import PortalCredits from './PortalCredits';
const Crown = lazy(() => import('./CrownApp'));
const SecretHitler = lazy(() => import('./secretHitler/App'));
type Game = 'crown' | 'secret-hitler' | 'home';
function route(): Game { return location.hash === '#/crown' ? 'crown' : location.hash === '#/secret-hitler' ? 'secret-hitler' : 'home'; }
function Portal(){
 const [game,setGame]=useState<Game>(route);
 useEffect(()=>{const change=()=>setGame(route());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
 useEffect(()=>{document.title=game==='home'?'Hội Kín · Chọn cuộc chơi':game==='crown'?'Ngai Vàng · One King One Crown':'Secret Hitler · Hội Kín';if(game!=='crown')return;const link=document.createElement('link');link.rel='stylesheet';link.href=crownStyles;document.head.append(link);return()=>link.remove()},[game]);
 const home=()=>{location.hash='/';};
 if(game==='secret-hitler')return <Suspense fallback={<Loading/>}><SecretHitler onHome={home}/></Suspense>;
 if(game==='crown')return <><a className="portal-return" href="#/">← Chọn game</a><Suspense fallback={<Loading/>}><Crown/></Suspense></>;
 return <div className="portal"><header className="portal-header"><a href="#/" className="portal-brand"><span>◈</span> HỘI KÍN</a><span>NHỮNG CUỘC CHƠI CỦA LÒNG TIN</span><div className="portal-live"><i/> Bàn chơi trực tuyến</div></header><main className="portal-main"><div className="portal-kicker">BẠN BÈ QUANH BÀN · BÍ MẬT TRÊN TAY</div><h1>Tối nay, bạn sẽ<br/><em>tin ai?</em></h1><p className="portal-intro">Chọn một cuộc chơi. Mời những người bạn.<br/>Và để mọi lời hứa được thử thách.</p><div className="portal-games"><a href="#/crown" className="portal-game portal-crown"><div className="portal-game-art" aria-hidden="true"><div className="portal-orbit"/><span className="portal-crown-symbol">♛</span><div className="portal-mini-card">♜<small>QUYỀN LỰC</small></div><div className="portal-coins">✧</div></div><div className="portal-game-meta"><span>01 / TRANH ĐOẠT VƯƠNG QUYỀN</span><span>4–8 NGƯỜI</span></div><h2>Ngai Vàng</h2><div className="portal-game-sub">ONE KING ONE CROWN</div><p>Giấu bài, gom vàng, đổi ngôi.<br/>Vương miện chỉ thuộc về một người.</p><div className="portal-enter">Bước vào tửu quán <b>↗</b></div></a><a href="#/secret-hitler" className="portal-game portal-secret"><div className="portal-game-art" aria-hidden="true"><div className="portal-orbit"/><img src="/secret-hitler/role-hitler.webp" className="portal-secret-card" alt=""/><div className="portal-ballot">Ja!<small>LÁ PHIẾU CỦA BẠN</small></div><span className="portal-secret-stamp">TOP SECRET</span></div><div className="portal-game-meta"><span>02 / SUY LUẬN & BỎ PHIẾU</span><span>5–10 NGƯỜI</span></div><h2>Secret Hitler</h2><div className="portal-game-sub">MỘT HỘI ĐỒNG. HAI PHE. MỘT BÍ MẬT.</div><p>Bầu chính phủ, thông qua chính sách.<br/>Kẻ nguy hiểm có thể ngồi ngay bên bạn.</p><div className="portal-enter">Bước vào nghị viện <b>↗</b></div></a></div><div className="portal-notes"><span>◈ Phòng riêng cho nhóm bạn</span><span>◈ Không cần tài khoản</span><span>◈ Không gian 3D · Thẻ bài 2D</span></div><PortalCredits/></main><footer className="portal-footer"><span>HAI CUỘC CHƠI. VÔ SỐ ÂM MƯU.</span><span>Chơi cùng nhau, giữ riêng bí mật.</span></footer></div>;
}
function Loading(){return <div className="portal-loading" role="status">◈<span>Đang chuẩn bị bàn chơi…</span></div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Portal/></React.StrictMode>);
