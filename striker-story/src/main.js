import './ui/style.css';
import { PitchRenderer } from './render/pitch.js';
import { MomentPlay } from './game/momentPlay.js';
import { MatchFlow } from './game/matchFlow.js';
import { Career } from './career/career.js';
import { FX } from './fx/fx.js';
import { Audio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { haptics } from './fx/haptics.js';

const SETTINGS_KEY = 'striker-story-settings';
let settings = { sound: true, haptics: true };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (_) { /* */ }

const canvas = document.getElementById('pitch');
const renderer = new PitchRenderer(canvas);
const fx = new FX();
const audio = new Audio();
audio.enabled = settings.sound;
haptics.enabled = settings.haptics;
const career = new Career();
const play = new MomentPlay({ renderer, fx, audio });

const app = {
  mode: 'menu', play, flow: null, training: null,
  saveSettings() { settings.sound = audio.enabled; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* */ } },
  startMatch() {
    this.mode = 'match';
    const flow = new MatchFlow({ career, play, audio, ui });
    this.flow = flow;
    flow.start();
    ui.showMatch(flow);
  },
  startTraining(drill = 'shooting') {
    if (!career.doActivity('train')) return;
    this.mode = 'training';
    this.training = { drill, shot: 0, of: drill === 'shooting' ? 5 : 3, hits: 0, seed: career.d.seed + career.d.week * 7 + Math.floor(Math.random() * 1e6) };
    ui.showTraining(this.training);
    this._nextTrainingShot();
  },
  startTeamNight() {
    if (!career.doActivity('team')) return;
    this.mode = 'training';
    this.training = { shot: 0, of: 3, hits: 0, team: true, seed: career.d.seed + career.d.week * 11 + Math.floor(Math.random() * 1e6) };
    ui.showTraining(this.training);
    this._nextTrainingShot();
  },
  _nextTrainingShot() {
    const t = this.training;
    ui.flow = null;
    const type = t.team ? 'crossbar' : { shooting: 'training', dribble: 'takeon', passing: 'buildup' }[t.drill];
    play.start(type, t.seed + t.shot * 31, { keeper: 0.9, defence: 0.9 }, ui.momentCtx());
    if (t.drill === 'passing' && play.m.pressure != null) play.m.pressure += 3;
    ui.mhud?.remove(); ui.momentStart(true);
    play.onResult = () => {
      t.shot++;
      ui.updateTraining(t);
      if (t.shot >= t.of) {
        this.mode = 'hub'; ui.mhud?.remove(); this.training = null;
        if (t.team) ui.teamNightDone(t.hits, career.teamNightReward(t.hits));
        else ui.trainingDone(t.hits, career.trainingReward(t.hits));
      }
      else this._nextTrainingShot();
    };
  },
};

const ui = new UI(document.getElementById('ui'), { career, audio, app });
play.onEvent = (type) => {
  if (type === 'goal' && app.mode === 'match') ui.banner('GOAL!');
  if (type === 'replay') ui.replayLabel(true);
  if (type === 'replayend') ui.replayLabel(false);
  if (app.mode === 'match') app.flow?.onMomentEvent?.(type);
  if (type === 'target' && app.training) { app.training.hits++; ui.updateTraining(app.training); }
  if (app.training && !app.training.team && ((type === 'skill' && app.training.drill === 'dribble') || (type === 'received' && app.training.drill === 'passing'))) { app.training.hits++; ui.updateTraining(app.training); }
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
  if (play.m) renderer.frame(play.m, ui.safeTop() + 60, ui.safeBottom() + 70);
}
window.addEventListener('resize', resize);
resize();

// input
let pid = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (pid !== null) return;
  if (play.down(e.clientX, e.clientY)) { pid = e.pointerId; try { canvas.setPointerCapture(pid); } catch (_) { /* */ } }
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerId === pid) play.move(e.clientX, e.clientY); });
canvas.addEventListener("pointerup", (e) => { if (e.pointerId !== pid) return; pid = null; play.up(e.clientX, e.clientY); });
canvas.addEventListener('pointercancel', (e) => { if (e.pointerId !== pid) return; pid = null; play.aim = null; audio.chargeStop(); });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });

window.__S = { app, career, play, ui, timeWarp: 1 };
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05) * window.__S.timeWarp;
  last = now;
  if (app.mode === 'match' && app.flow) { if (!play.m) app.flow.update(dt); }
  play.update(dt);
  const theme = play.m ? play.ctx.theme : { us: ['#1f5aa8', '#fff'], opp: ['#b3262e', '#fff'], gk: ['#19c37d', '#0b3d1f'] };
  renderer.render(play.m, null, fx, dt, theme);
  if (play.m) play.drawOverlay(renderer.g);
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => { last = t; frame(t); });
ui.showTitle();
setTimeout(() => document.getElementById('boot')?.remove(), 200);
