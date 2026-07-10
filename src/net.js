// Two-player realtime layer — Supabase broadcast + presence on one fixed channel.
// Only ever two identities: james and hannah. No tables, no auth, no lobby.
// If the env vars are missing every call here is a harmless no-op (solo mode).

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const PARTNER = { james: 'hannah', hannah: 'james' };

export function getIdentity() {
  const who = localStorage.getItem('countdown.who');
  return who === 'james' || who === 'hannah' ? who : null;
}

export function setIdentity(name) {
  localStorage.setItem('countdown.who', name);
  net.me = name;
  net.connect();
}

const POSE_INTERVAL = 0.1; // 10 Hz

// events emitted locally (from presence transitions), never sent over the wire
const LOCAL_EVENTS = new Set(['peer-join', 'peer-leave', 'double-join']);

class Net {
  constructor() {
    this.enabled = !!(URL && KEY);
    this.me = null;
    this.peer = null; // partner name while they're online, else null
    this.channel = null;
    this.listeners = new Map();
    this.relayed = new Set();
    this.poseTimer = 0;
    this.lastPose = null;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    // listener registered after connect() — attach its wire relay now
    if (this.channel && !LOCAL_EVENTS.has(event)) this.#relay(event);
  }

  #emit(event, payload) {
    for (const fn of this.listeners.get(event) || []) fn(payload);
  }

  send(event, payload = {}) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event, payload: { ...payload, from: this.me } });
  }

  // broadcast.self:false only filters the same socket — a second tab of the
  // same person is a different socket, so filter by identity here too.
  #relay(event) {
    if (this.relayed.has(event)) return;
    this.relayed.add(event);
    this.channel.on('broadcast', { event }, ({ payload }) => {
      if (!payload || payload.from === this.me) return;
      this.#emit(event, payload);
    });
  }

  async connect() {
    if (!this.enabled || !this.me || this.channel) return;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(URL, KEY);
      const channel = client.channel('countdown-room', {
        config: { broadcast: { self: false }, presence: { key: this.me } },
      });
      this.channel = channel;

      // relay every wire event anything has subscribed to (games register
      // their listeners in their constructors, before this async connect
      // resolves; on() covers any that register later)
      for (const event of this.listeners.keys()) {
        if (!LOCAL_EVENTS.has(event)) this.#relay(event);
      }

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const partner = PARTNER[this.me];
        const here = partner in state ? partner : null;
        if (here && !this.peer) { this.peer = here; this.#emit('peer-join', here); }
        if (!here && this.peer) { this.peer = null; this.#emit('peer-leave', partner); }
        if ((state[this.me]?.length ?? 0) > 1) this.#emit('double-join', this.me);
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ who: this.me, at: Date.now() });
          this.send('hello');
        }
      });
    } catch (e) {
      // realtime is optional — the world works solo
      this.channel = null;
    }
  }

  // Called every frame from the main loop; throttled + change-detected inside.
  tickPose(player, dt) {
    if (!this.channel || !player.started) return;
    this.poseTimer += dt;
    if (this.poseTimer < POSE_INTERVAL) return;
    this.poseTimer = 0;
    const pose = {
      x: Math.round(player.pos.x * 100) / 100,
      z: Math.round(player.pos.z * 100) / 100,
      yaw: Math.round(player.yaw * 100) / 100,
      seated: player.seated,
    };
    const last = this.lastPose;
    if (last && last.x === pose.x && last.z === pose.z && last.yaw === pose.yaw && last.seated === pose.seated) return;
    this.lastPose = pose;
    this.send('pose', pose);
  }
}

export const net = new Net();

export function initNet() {
  const who = getIdentity();
  if (who) {
    net.me = who;
    net.connect();
  }
}
