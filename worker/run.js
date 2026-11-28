/* A fase de simulação do campeonato multiplayer, compartilhada pelas salas de campeonato e de leilão:
 * quando os elencos dos humanos estão prontos, o torneio roda igual (suíço + playoffs, completado com times
 * históricos até 16). PURO: sem Cloudflare, sem I/O. O servidor avança etapa por etapa e o torneio é
 * reconstruído por replay determinístico (seed + nº de etapas). */
import { ROLES } from "../site/js/data.js";
import { createCup, advance, teamStatus, tournamentMvp } from "../site/js/engine.js";

const tm = (x) => ({ name: x.nome, human: x.isHuman ? x.slot : null, forca: x.forca });

function serializeEvent(ev) {
  if (ev.type === "seed") return { type: "seed", seeds: ev.seeds.map(tm) };
  return {
    type: ev.type, round: ev.round ?? null,
    matches: ev.results.map(({ a, b, res, bo }) => ({
      a: tm(a), b: tm(b), bo, winsA: res.winsA, winsB: res.winsB, winner: res.winner === a ? "A" : "B",
      maps: res.maps.map((m) => [m.map, m.a, m.b, m.ot]),
    })),
  };
}

/* humans: [{ teamName, squad (de resolveSquad), style }] · devolve { t, events } já avançado `steps` etapas. */
export function buildRun(humans, seed, steps = 0) {
  const run = { t: createCup({ humans, seed }), events: [] };
  for (let i = 0; i < steps; i++) stepRun(run);
  return run;
}

/* Avança uma etapa. Devolve true se avançou (false: o torneio já acabou). */
export function stepRun(run) {
  const ev = advance(run.t);
  if (!ev) return false;
  run.events.push(serializeEvent(ev));
  return true;
}

export const runPhase = (run) => (run.t.phase === "done" ? "done" : "running");

/* A parte do estado que o cliente vê depois que o torneio começa. `nickOf(slot, role)` diz quem joga em cada vaga. */
export function runView(run, nickOf) {
  const t = run.t;
  const out = {
    teams: t.teams.map((x) => ({ name: x.nome, human: x.isHuman ? x.slot : null, forca: x.forca, wins: x.wins, losses: x.losses, status: teamStatus(t, x) })),
    events: run.events, result: null,
  };
  if (t.phase === "done") {
    const mvp = tournamentMvp(t);
    out.result = {
      champion: tm(t.champion),
      humans: t.teams.filter((x) => x.isHuman).map((x) => ({
        slot: x.slot, name: x.nome, wins: x.wins, losses: x.losses, status: teamStatus(t, x),
        perfeito: t.champion === x && x.wins === 3 && x.losses === 0 && x.mapsLostPlayoffs === 0,
        squad: Object.fromEntries(ROLES.map((r) => [r, nickOf(x.slot, r)])),
      })),
      mvp: mvp ? { nick: mvp.nick, team: mvp.teamNome, kills: mvp.kills, deaths: mvp.deaths } : null,
    };
  }
  return out;
}
