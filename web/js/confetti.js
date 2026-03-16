// Lightweight confetti & fireworks celebration effects
// Triggers on 100% test pass rate — pure vanilla JS, no dependencies

(function () {
  function createCanvas() {
    const c = document.createElement('canvas');
    Object.assign(c.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '9999'
    });
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    document.body.appendChild(c);
    return c;
  }

  function animate(canvas, particles, duration) {
    const ctx = canvas.getContext('2d');
    const start = performance.now();
    const gravity = 0.12;

    (function frame(now) {
      const elapsed = now - start;
      if (elapsed > duration) {
        canvas.remove();
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const progress = elapsed / duration;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.vx += p.drift;
        p.rotation += p.rotSpeed;

        const alpha = Math.max(0, 1 - progress * progress);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    })(start);
  }

  const COLORS = ['#FFD700', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function makeParticle(x, y, vx, vy) {
    return {
      x, y, vx, vy,
      drift: rand(-0.02, 0.02),
      rotation: rand(0, Math.PI * 2),
      rotSpeed: rand(-0.08, 0.08),
      w: rand(5, 10),
      h: rand(3, 7),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
  }

  window.launchConfetti = function () {
    const canvas = createCanvas();
    const particles = [];
    const w = canvas.width;
    const h = canvas.height;

    for (let i = 0; i < 80; i++) {
      particles.push(makeParticle(
        rand(w * 0.2, w * 0.8), h + 10,
        rand(-4, 4), rand(-14, -7)
      ));
    }
    animate(canvas, particles, 2500);
  };

  window.launchFireworks = function () {
    const canvas = createCanvas();
    const particles = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bursts = [
      { x: cx, y: cy },
      { x: cx - 200, y: cy - 80 },
      { x: cx + 200, y: cy - 80 }
    ];

    for (const b of bursts) {
      for (let i = 0; i < 60; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(2, 9);
        particles.push(makeParticle(
          b.x, b.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed
        ));
      }
    }
    animate(canvas, particles, 2500);
  };
})();
