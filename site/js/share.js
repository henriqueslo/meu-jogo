/* Card de compartilhamento (canvas) + Web Share API. Sem estado global: recebe os dados. */
export function drawShareCard(d){
  const W = 1080, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const T = '#E0953A', CT = '#6EA8DC', GOLD = '#D9B44A';
  const TEXT = '#EAF0F3', DIM = '#8DA0AB';

  // fundo
  c.fillStyle = '#0D1114'; c.fillRect(0,0,W,H);
  const glow = c.createRadialGradient(W/2, -80, 0, W/2, -80, 760);
  glow.addColorStop(0, 'rgba(110,168,220,0.10)');
  glow.addColorStop(1, 'rgba(110,168,220,0)');
  c.fillStyle = glow; c.fillRect(0,0,W,H);

  // barra T | CT no topo
  const bar = c.createLinearGradient(0,0,W,0);
  bar.addColorStop(0, T); bar.addColorStop(0.42, 'rgba(224,149,58,0.25)');
  bar.addColorStop(0.58, 'rgba(110,168,220,0.25)'); bar.addColorStop(1, CT);
  c.fillStyle = bar; c.fillRect(0,0,W,10);

  // título — mede as duas palavras pra centralizar o par sem sobreposição
  c.font = '700 62px Rajdhani, sans-serif';
  c.textAlign = 'left';
  const w1 = c.measureText('MINHA').width;
  const w2 = c.measureText('LINEUP').width;
  const gapT = 18;
  let tx = W/2 - (w1 + gapT + w2)/2;
  c.fillStyle = T; c.fillText('MINHA', tx, 130);
  c.fillStyle = CT; c.fillText('LINEUP', tx + w1 + gapT, 130);

  c.textAlign = 'center';
  c.font = '600 26px Rajdhani, sans-serif'; c.fillStyle = DIM;
  c.fillText(d.modo.toUpperCase(), W/2, 178);

  // nome do time
  c.font = '700 76px Rajdhani, sans-serif'; c.fillStyle = TEXT;
  c.fillText(d.nome.toUpperCase().slice(0,20), W/2, 288);

  // lineup
  c.font = '600 22px Rajdhani, sans-serif'; c.fillStyle = DIM;
  c.fillText('LINEUP', W/2, 350);
  d.lineup.forEach((p,i)=>{
    const y = 402 + i*54;
    c.textAlign = 'right';
    c.font = '600 24px Rajdhani, sans-serif'; c.fillStyle = DIM;
    c.fillText(p.papel.toUpperCase(), W/2 - 24, y);
    c.textAlign = 'left';
    c.font = '700 30px Rajdhani, sans-serif'; c.fillStyle = TEXT;
    c.fillText(p.nick, W/2 + 24, y);
  });

  // quadradinhos da primeira fase
  const total = d.wins + d.losses;
  const sq = 52, gap = 12;
  const startX = W/2 - (total*sq + (total-1)*gap)/2;
  const sqY = 700;
  for(let i=0;i<total;i++){
    c.fillStyle = i < d.wins ? '#58B368' : '#C0392B';
    c.fillRect(startX + i*(sq+gap), sqY, sq, sq);
  }
  c.textAlign = 'center';
  c.font = '600 24px Rajdhani, sans-serif'; c.fillStyle = DIM;
  c.fillText(`PRIMEIRA FASE  ${d.wins}-${d.losses}`, W/2, sqY + 96);

  // resultado
  const boxY = 848, boxH = 132;
  c.fillStyle = d.perfeito || d.isChampion ? 'rgba(217,180,74,0.10)' : '#1B2328';
  c.fillRect(70, boxY, W-140, boxH);
  c.strokeStyle = d.perfeito || d.isChampion ? GOLD : '#2A343B';
  c.lineWidth = 2; c.strokeRect(70, boxY, W-140, boxH);
  c.font = '700 46px Rajdhani, sans-serif';
  c.fillStyle = d.perfeito || d.isChampion ? GOLD : TEXT;
  c.fillText(d.resultadoCurto, W/2, boxY + 62);
  if(d.resultadoSub){
    c.font = '600 24px Rajdhani, sans-serif'; c.fillStyle = DIM;
    c.fillText(d.resultadoSub, W/2, boxY + 102);
  }

  c.font = '600 22px Rajdhani, sans-serif'; c.fillStyle = DIM;
  c.fillText('monte sua lineup · dispute o Major · busque o 3-0', W/2, 1035);

  return cv;
}
function canvasToFile(cv){
  return new Promise(resolve=>{
    cv.toBlob(blob=>{
      if(!blob) return resolve(null);
      resolve(new File([blob], 'minha-lineup.png', {type:'image/png'}));
    }, 'image/png');
  });
}
export async function shareResult(btn, lastShareData, lastShareText){
  const setLabel = (txt, ms)=>{
    if(!btn) return;
    const orig = btn.dataset.orig || btn.textContent;
    btn.dataset.orig = orig;
    btn.textContent = txt;
    if(ms) setTimeout(()=>{ btn.textContent = orig; }, ms);
  };

  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    // sem dados da lineup em memória (ex: recarregou a página) -> compartilha só texto
    const cv = lastShareData ? drawShareCard(lastShareData) : null;
    const file = cv ? await canvasToFile(cv) : null;

    // 1) share nativo com imagem
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], text:lastShareText, title:'Minha LineUp'});
      return;
    }
    // 2) share nativo só com texto
    if(navigator.share){
      await navigator.share({text:lastShareText, title:'Minha LineUp'});
      return;
    }
    // 3) desktop: baixa a imagem e copia o texto
    if(file){
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = 'minha-lineup.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(lastShareText);
    }
    setLabel('✅ Card baixado!', 2200);
  }catch(e){
    // usuário cancelou o share sheet: não é erro, não mostra nada
    if(e && e.name === 'AbortError') return;
    try{
      if(navigator.clipboard) await navigator.clipboard.writeText(lastShareText);
      setLabel('✅ Texto copiado!', 2200);
    }catch(_){ setLabel('Não foi possível compartilhar', 2600); }
  }
}
