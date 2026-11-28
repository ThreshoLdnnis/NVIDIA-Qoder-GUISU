(() => {
  'use strict';

  const scene = window.ReFormEngineeringScene;
  const canvas = document.getElementById('assembly-canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!scene || !context) return;

  const slider = document.getElementById('explode-slider');
  const sliderValue = document.getElementById('explode-value');
  const play = document.getElementById('play-motion');
  const reset = document.getElementById('reset-view');
  const components = document.getElementById('components');
  const info = document.getElementById('component-info');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const defaultInfo = info.textContent;
  const camera = { yaw: .58, pitch: .49, zoom: 1 };
  let activeComponent = 'all';
  let spread = Number(slider.value) / 100;
  let width = 0;
  let height = 0;
  let queued = false;
  let animationId = 0;
  let drag = null;

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const bounds = [-.05, 1.29];

  const polygons = scene.mesh.map(face => ({
    ...face,
    rgb: [1,3,5].map(index => parseInt(face.color.slice(index, index + 2), 16)),
    center: face.vertices.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / face.vertices.length), [0,0,0])
  }));

  function cameraView() {
    const { yaw, pitch, zoom } = camera;
    const sx = Math.sin(yaw);
    const cx = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const right = [cx,0,-sx];
    const up = [-sx * sp,cp,-cx * sp];
    const forward = [sx * cp,sp,cx * cp];
    const focus = [0,.70,0];
    const location = forward.map((axis, index) => focus[index] + 11 * axis);
    const scale = Math.min(width / 6.7, height / 4.85) * zoom;
    const project = point => {
      const relative = [point[0], point[1] - focus[1], point[2]];
      const depth = dot(relative, forward);
      const magnitude = scale * 11 / (11 - depth);
      return [width / 2 + dot(relative,right) * magnitude, height * .47 - dot(relative,up) * magnitude, depth];
    };
    return { project, location, depthAt: point => dot(point, forward) };
  }

  function line(from, to, color, thickness = 1) {
    context.beginPath();
    context.moveTo(from[0], from[1]);
    context.lineTo(to[0], to[1]);
    context.strokeStyle = color;
    context.lineWidth = thickness;
    context.stroke();
  }

  function drawStage(project) {
    const glow = context.createRadialGradient(width * .56, height * .26, 0, width * .55, height * .42, Math.max(width, height) * .73);
    glow.addColorStop(0, '#293a2a');
    glow.addColorStop(.40, '#151e15');
    glow.addColorStop(1, '#0b100d');
    context.fillStyle = glow;
    context.fillRect(0,0,width,height);
    for (let guide = -5; guide <= 5; guide++) {
      const axis = guide * .55;
      const color = guide === 0 ? '#8fa98948' : '#8fa9892b';
      line(project([axis,-.84,-3.25]), project([axis,-.84,3.25]), color);
      line(project([-3.25,-.84,axis]), project([3.25,-.84,axis]), color);
    }
    if (spread > .15) {
      for (const x of [-1.62,1.62]) {
        const from = project([x,.28 - spread*.7,.85]);
        const to = project([x,.40 + spread*1.05,.85]);
        context.setLineDash([3,6]);
        line(from,to,'#adc7a082');
        context.setLineDash([]);
      }
    }
  }

  function fillFace(face, points) {
    const selected = activeComponent === 'all' || face.id === activeComponent;
    const strength = .56 + .56 * Math.max(0, dot(face.normal, [-.36,.81,.46]));
    const rim = Math.max(0, dot(face.normal, [.58,.2,-.79]));
    const tones = face.rgb.map((channel, i) => clamp(Math.round(channel * strength + rim * [9,19,11][i]), 0, 255));
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
    context.globalAlpha = selected ? 1 : .22;
    context.fillStyle = `rgb(${tones.join(',')})`;
    context.fill();
    if (face.edge) {
      context.strokeStyle = activeComponent === face.id ? '#beddaa99' : '#c4cec33b';
      context.lineWidth = activeComponent === face.id ? 1.08 : .7;
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function draw() {
    queued = false;
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    const view = cameraView();
    drawStage(view.project);
    const projected = [];
    for (const face of polygons) {
      const shift = face.offset.map(value => value * spread);
      const center = face.center.map((value, index) => value + shift[index]);
      if (dot(face.normal, view.location.map((axis, index) => axis - center[index])) <= 0) continue;
      const points = face.vertices.map(point => view.project(point.map((axis, index) => axis + shift[index])));
      projected.push({ face, points, depth: view.depthAt(center) });
    }
    projected.sort((a,b) => a.depth - b.depth);
    for (const item of projected) fillFace(item.face, item.points);
  }

  function drawSoon() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  }

  function updateSpread(value) {
    spread = clamp(value, 0, 1);
    const percentage = Math.round(spread * 100);
    slider.value = percentage;
    sliderValue.textContent = `${percentage}%`;
    drawSoon();
  }

  function stopPlayback() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
    play.setAttribute('aria-pressed', 'false');
    play.textContent = reducedMotion.matches ? '切换拆装' : '播放拆装';
  }

  function playSequence() {
    if (reducedMotion.matches) {
      updateSpread(spread >= .5 ? 0 : 1);
      return;
    }
    const start = performance.now();
    const initialSpread = spread;
    const duration = 4600;
    play.setAttribute('aria-pressed', 'true');
    play.textContent = '暂停';
    const ease = value => value * value * (3 - 2 * value);
    function tick(time) {
      const phase = clamp((time - start) / duration, 0, 1);
      if (phase < .40) updateSpread(initialSpread + (1 - initialSpread) * ease(phase / .40));
      else if (phase < .52) updateSpread(1);
      else updateSpread(1 - ease((phase - .52) / .48));
      if (phase < 1) animationId = requestAnimationFrame(tick);
      else stopPlayback();
    }
    animationId = requestAnimationFrame(tick);
  }

  for (const component of scene.components) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.component = component.id;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = component.name;
    components.append(button);
  }
  components.addEventListener('click', event => {
    const button = event.target.closest('button[data-component]');
    if (!button) return;
    activeComponent = button.dataset.component;
    for (const current of components.children) current.setAttribute('aria-pressed', String(current === button));
    const part = scene.components.find(component => component.id === activeComponent);
    info.textContent = part ? `${part.code} · ${part.count}。${part.description}` : defaultInfo;
    drawSoon();
  });
  slider.addEventListener('input', () => {
    stopPlayback();
    updateSpread(Number(slider.value) / 100);
  });
  play.addEventListener('click', () => animationId ? stopPlayback() : playSequence());
  reducedMotion.addEventListener('change', stopPlayback);
  reset.addEventListener('click', () => {
    stopPlayback();
    Object.assign(camera, { yaw: .58, pitch: .49, zoom: 1 });
    updateSpread(.72);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    camera.yaw += (event.clientX - drag.x) * .012;
    camera.pitch = clamp(camera.pitch + (event.clientY - drag.y) * .008, ...bounds);
    drag.x = event.clientX;
    drag.y = event.clientY;
    drawSoon();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(name, event => {
      if (drag?.pointer === event.pointerId) {
        drag = null;
        canvas.classList.remove('dragging');
      }
    });
  }
  canvas.addEventListener('wheel', event => {
    if (document.activeElement !== canvas && !event.ctrlKey) return;
    event.preventDefault();
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .0014), .58, 1.9);
    drawSoon();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    switch (event.key) {
      case 'ArrowLeft': camera.yaw -= .14; break;
      case 'ArrowRight': camera.yaw += .14; break;
      case 'ArrowUp': camera.pitch = clamp(camera.pitch + .10, ...bounds); break;
      case 'ArrowDown': camera.pitch = clamp(camera.pitch - .10, ...bounds); break;
      case '+': case '=': camera.zoom = clamp(camera.zoom + .12, .58, 1.9); break;
      case '-': camera.zoom = clamp(camera.zoom - .12, .58, 1.9); break;
      default: return;
    }
    event.preventDefault();
    drawSoon();
  });
  new ResizeObserver(drawSoon).observe(canvas);
  stopPlayback();
  drawSoon();
})();
