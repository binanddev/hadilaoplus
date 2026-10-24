import {celebrationStarts,finaleShotTimes, type FinalePlan} from './finale.ts';

/** A finite victory chime and synchronized ceremony shots; never ambient music. */
export class FinaleAudio {
  private baseline: string|null|undefined = undefined;
  private unlocked = false;
  private enabled = true;
  private disposed = false;
  private sources = new Set<AudioScheduledSourceNode>();
  private nodes = new Set<AudioNode>();
  private readonly context: () => AudioContext;
  private generation = 0;

  constructor(context: () => AudioContext) { this.context = context; }

  unlock() { if (!this.disposed) this.unlocked = true; }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.cancel(); }
  resetBaseline() { this.baseline = undefined; this.cancel(); }

  observe(plan: FinalePlan|null|undefined) {
    const previous = this.baseline;
    this.baseline = plan?.id ?? null;
    if (!plan) { this.cancel(); return; }
    if (this.disposed || previous === undefined || previous === plan.id || !this.enabled || !this.unlocked) return;
    this.cancel();
    try {
      const context = this.context();
      if (context.state === 'closed') return;
      const generation = this.generation;
      void context.resume().catch(() => { if (generation === this.generation) this.cancel(); });
      const now = context.currentTime + .035;
      // C major, ascending and resolving; a small bell overtone makes it sparkle.
      const notes = [523.25,659.25,783.99,1046.5,783.99,1046.5,1318.51,1567.98];
      notes.forEach((frequency,index) => {
        this.bell(context, frequency, now + index * .23, index === notes.length - 1 ? .8 : .5, .055);
      });
      [783.99,1046.5,1318.51,1567.98].forEach((frequency,index)=>{
        this.bell(context,frequency,now+celebrationStarts(plan)+index*.2,index===3?1:.45,.05);
      });
      finaleShotTimes(plan).forEach(time => this.shot(context, now + time));
    } catch { this.cancel(); }
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.sources.add(source);
    nodes.forEach(node => this.nodes.add(node));
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      for (const node of nodes) { node.disconnect(); this.nodes.delete(node); }
    };
  }

  private bell(context: AudioContext, frequency: number, time: number, duration: number, volume: number) {
    for (const [multiple,strength] of [[1,1],[2.76,.19]]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * multiple, time);
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(volume * strength, time + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      this.track(oscillator,[gain]);
      oscillator.start(time); oscillator.stop(time + duration + .02);
    }
  }

  private shot(context: AudioContext, time: number) {
    const duration = .16, buffer = context.createBuffer(1,Math.ceil(context.sampleRate * duration),context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (context.sampleRate * .024));
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(2900,time);
    gain.gain.setValueAtTime(.08,time); gain.gain.exponentialRampToValueAtTime(.0001,time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    this.track(source,[filter,gain]);
    source.start(time); source.stop(time + duration + .02);
  }

  private cancel() {
    this.generation++;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* An already ended source needs no action. */ }
      source.disconnect();
    }
    this.sources.clear();
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
  }

  dispose() { this.disposed = true; this.cancel(); }
}
