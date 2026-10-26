import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '../area-manager.mjs';
import { soldierUrl } from '../crew.js';
import { createCharacter, createLabel, createSoldier } from '../dev/kit.js';
import scenarios from '../dev/scenarios/index.js';

// Dev sandbox: one scenario per visit, chosen by the area variant ('dev/<id>').
const PAD = 6.8;
// Extra character models a scenario can request with `models: ['xbot']`.
const MODELS = {
  xbot: { url: new URL('../assets/Xbot.glb', import.meta.url).href, options: { clips: { Idle: 'idle', Walk: 'walk', Run: 'run' }, flip: true } },
};

// Stand far enough back that the scenario's width fits the screen (70° vertical FOV).
function viewPose(scenario) {
  const width = scenario.viewWidth || 11.2;
  const aspect = (globalThis.innerWidth || 16) / (globalThis.innerHeight || 9);
  const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(35)) * aspect);
  const near = width / 2 + 1, distance = THREE.MathUtils.clamp(width / 2 / Math.tan(halfWidth), near, scenario.maxDistance || width * 1.6);
  // Look down at a point ~1 m above the scenario centre from the observer's eye height.
  return { x: 0, z: distance, yaw: Math.PI, pitch: -Math.atan2((scenario.eyeHeight || 1.7) - .6, distance) - .06 };
}

export async function createArea(saved = {}, { variant } = {}) {
  const scenario = scenarios.find(s => s.id === variant);
  if (!scenario) throw new Error('Unknown dev scenario: ' + variant);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a252c');
  // Optional mood: scenario.lighting = 'night'; scenario.fog = [color, density] (exponential) or [color, near, far] (linear).
  const night = scenario.lighting === 'night';
  scene.add(new THREE.HemisphereLight(night ? '#8fa6c2' : '#d8e6ec', '#2a2d2c', scenario.ambientIntensity ?? (night ? .7 : 2)));
  const sun = new THREE.DirectionalLight(night ? '#9fb6d6' : '#fff1dc', scenario.keyIntensity ?? (night ? .45 : 2.2)); sun.position.set(12, 20, 8); scene.add(sun);
  if (scenario.fog) { scene.fog = scenario.fog.length > 2 ? new THREE.Fog(...scenario.fog) : new THREE.FogExp2(scenario.fog[0], scenario.fog[1]); scene.background = new THREE.Color(scenario.fog[0]); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#33424a', roughness: 1 }));
  // Scenarios with their own ground (noPad) get the floor pushed well below it, so the two surfaces never fight.
  floor.rotation.x = -Math.PI / 2; floor.position.y = scenario.noPad ? -.2 : 0; scene.add(floor);
  if(!scenario.noPad){const grid = new THREE.GridHelper(200, 200, '#4f6670', '#40525a'); grid.position.y = .005; scene.add(grid);}
  if (!scenario.noPad) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(PAD, 48), new THREE.MeshStandardMaterial({ color: '#26343a', roughness: 1 }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = .004; scene.add(pad);
  }

  const loader = new GLTFLoader();
  const [gltf, ...extras] = await Promise.all([loader.loadAsync(soldierUrl), ...(scenario.models || []).map(name => loader.loadAsync(MODELS[name].url))]);
  const models = Object.fromEntries((scenario.models || []).map((name, i) => [name, extras[i]]));
  // character('xbot', { tint }) -> same shape as soldier(): { model, mixer, actions, setSpeed }
  const character = (name, options = {}) => createCharacter(models[name], { ...MODELS[name].options, ...options });
  let labels = [], group = null, instance = null;
  const label = (text, options) => { const m = createLabel(text, options); labels.push(m); return m; };
  const soldier = () => createSoldier(gltf);

  // (Re)build the scenario from scratch; used on load and by the Restart tool.
  function build() {
    if (group) { instance?.dispose?.(); scene.remove(group); disposeScene(group); }
    labels = [];
    group = new THREE.Group(); group.rotation.y = scenario.yaw || 0; scene.add(group);
    try { instance = scenario.create({ group, soldier, character, label, THREE }); }
    catch (e) { console.error('Dev scenario failed:', scenario.id, e); instance = null; const m = label(`${scenario.title}\nERROR: ${e.message}`, { width: 4, lines: 2 }); m.position.y = 2; group.add(m); }
  }
  build();

  let timeScale = saved.timeScale ?? 1, frozen = false;
  const world = new THREE.Vector3();
  // Scenarios may list camera views: [{ label, x, z, yaw, pitch, eye }]. defaultView selects the spawn; otherwise the first view is used.
  const views = scenario.views || [];
  const home = () => views.find(view => view.label === scenario.defaultView) || views[0] || { ...viewPose(scenario), eye: scenario.eyeHeight || 1.7 };
  let currentView = home().label || 'Free camera';
  let selectedView = home(), orbitAngle = 0, orbitPaused = false;
  const goTo = (view, setPose) => { selectedView = view; orbitAngle = 0; currentView = view.label || 'Free camera'; area.eyeHeight = view.eye ?? 1.7; area.walkSpeed = area.eyeHeight > 4 ? 9 : 4; setPose(view); };
  const area = {
    scene, title: 'Dev / ' + scenario.title, eyeHeight: home().eye ?? 1.7, walkSpeed: (home().eye ?? 1.7) > 4 ? 9 : 4,
    spawn: home(),
    tools: [
      ...views.map(view => ({ label: 'View: ' + view.label, isActive: () => currentView === view.label, action: ({ setPose }) => goTo(view, setPose) })),
      { label: 'Restart scenario', action: ({ setPose }) => { build(); goTo(home(), setPose); } },
      { label: 'Slow motion on/off', isActive: () => timeScale !== 1, action() { timeScale = timeScale === 1 ? .25 : 1; } },
      { label: 'Freeze on/off', isActive: () => frozen, action() { frozen = !frozen; } },
      // Scenarios can declare named modes; each gets its own button.
      ...(scenario.modes || []).map(mode => ({ label: mode, isActive: () => instance?.getStatus?.().mode === mode, action() { instance?.setMode?.(mode); } })),
      ...(views.some(view=>view.orbit) ? [{label:'Hold drone orbit',isActive:()=>orbitPaused,action(){orbitPaused=!orbitPaused;}}] : []),
    ],
    resetView(setPose) { goTo(home(),setPose); },
    // Views by address: 'inside-store', 'drone' … (used for ?view=).
    viewSlug: () => views.length ? currentView.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null,
    setView(slug, setPose) { const view = views.find(v => v.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug); if (view) goTo(view, setPose); },
    weatherLabel: scenario.weatherLabel,
    move(p, dx, dz) { if(selectedView.orbit)return; if(instance?.move && area.eyeHeight < 4){instance.move(p,dx,dz);return;} p.x = THREE.MathUtils.clamp(p.x + dx, -90, 90); p.z = THREE.MathUtils.clamp(p.z + dz, -90, 90); },
    update(dt, env = {}) {
      if (instance) {
        try { instance.update?.(frozen ? 0 : dt * timeScale, env); }
        catch (e) { console.error('Dev scenario update failed:', scenario.id, e); instance = null; }
      }
      // Labels turn to face the viewer around the vertical axis.
      if (env.position) for (const m of labels) {
        m.getWorldPosition(world);
        m.rotation.y = Math.atan2(env.position.x - world.x, env.position.z - world.z) - (m.parent?.rotation.y || 0);
      }
    },
    // The scenario's action is always available, wherever you stand.
    getInteraction() {
      const action = instance?.interaction?.();
      return action && { label: action.label + (timeScale !== 1 ? ' (slow-mo)' : ''), action: action.action };
    },
    // First-person weapon: the shell calls fire() with the camera ray; beforeRender() places the viewmodel.
    reload: () => { if (!frozen) instance?.reload?.(); },
    getAmmo: () => scenario.weapon && area.eyeHeight < 4 ? instance?.getAmmo?.() ?? null : null,
    canFire: () => !!scenario.weapon && !frozen && area.eyeHeight < 4,
    fire: scenario.weapon ? shot => !frozen && area.eyeHeight < 4 ? instance?.fire?.(shot) ?? null : null : undefined,
    getStatus() { const status=instance?.getStatus?.();return status && {...status, stats: `${currentView}${frozen ? ' · FROZEN' : timeScale !== 1 ? ' · 0.25×' : ''} · ${status.stats}`}; },
    beforeRender(camera,dt) {
      const step=frozen ? 0 : dt*timeScale, orbit=selectedView.orbit;
      // Raised cameras push linear fog back by their height so the block stays clear from above.
      if(scene.fog?.isFog){const lift=Math.max(0,camera.position.y-2);scene.fog.near=scenario.fog[1]+lift;scene.fog.far=scenario.fog[2]+lift*1.4;}
      else if(scene.fog && scenario.fog)scene.fog.density=orbit ? scenario.fog[1]*.45 : scenario.fog[1];
      if(orbit){
        if(!orbitPaused)orbitAngle+=step*orbit.speed;
        camera.position.set(Math.sin(orbitAngle)*orbit.radius,selectedView.eye,orbit.centerZ+Math.cos(orbitAngle)*orbit.radius);
        camera.lookAt(0,orbit.targetY,orbit.centerZ);
        camera.updateMatrixWorld();
      }
      instance?.beforeRender?.(camera,step);
    },
    snapshot() { return { timeScale }; },
    dispose() { instance?.dispose?.(); },
  };
  return area;
}
