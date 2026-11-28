(function (root) {
  'use strict';

  const components = [
    { id: 'wood', code: 'MAT-W01', name: '回收木质底座', count: '1 件', description: '提供摆件的支承平面。演示仅使用简化矩形，不包含实际孔距与公差。' },
    { id: 'angles', code: 'MAT-M01', name: '旧金属角码', count: '4 件', description: '连接外壳模块与底座。展开视图将四件角码朝外分离，便于查看连接关系。' },
    { id: 'housings', code: 'MAT-E01', name: '回收金属外壳', count: '2 件', description: '两件带开孔的空壳组成摆件主体。实物应用前需确认无电池、无电源残留。' },
    { id: 'bolts', code: 'MAT-F01', name: '可复用螺栓', count: '8 件', description: '框架优先方案中的紧固件示意。螺纹规格、配合与强度需实物复核。' }
  ];

  const metal = '#666e67';
  const bright = '#969e93';
  const shadow = '#303832';
  const steel = '#a6ada3';
  const grain = ['#806756', '#896955', '#947157', '#775f50', '#967358', '#8b6c55'];
  const mesh = [];

  function polygon(id, vertices, normal, color, offset, edge) {
    mesh.push({ id, vertices, normal, color, offset, edge });
  }

  function cuboid(id, position, size, color, offset, top = color) {
    const [x, y, z] = position;
    const [width, height, depth] = size;
    const [l, r] = [x - width / 2, x + width / 2];
    const [b, t] = [y - height / 2, y + height / 2];
    const [n, f] = [z - depth / 2, z + depth / 2];
    polygon(id, [[l,b,f],[r,b,f],[r,t,f],[l,t,f]], [0,0,1], color, offset, true);
    polygon(id, [[r,b,n],[l,b,n],[l,t,n],[r,t,n]], [0,0,-1], color, offset, true);
    polygon(id, [[r,b,f],[r,b,n],[r,t,n],[r,t,f]], [1,0,0], color, offset, true);
    polygon(id, [[l,b,n],[l,b,f],[l,t,f],[l,t,n]], [-1,0,0], color, offset, true);
    polygon(id, [[l,t,f],[r,t,f],[r,t,n],[l,t,n]], [0,1,0], top, offset, true);
    polygon(id, [[l,b,n],[r,b,n],[r,b,f],[l,b,f]], [0,-1,0], color, offset, true);
  }

  function cylinder(id, position, radius, height, segments, color, offset, turn = Math.PI / 6) {
    const [x,y,z] = position;
    const ring = direction => Array.from({ length: segments }, (_, index) => {
      const angle = turn + index * 2 * Math.PI / segments;
      return [x + Math.cos(angle) * radius, y + direction * height / 2, z + Math.sin(angle) * radius];
    });
    const above = ring(1);
    const below = ring(-1);
    polygon(id, above, [0,1,0], color, offset, true);
    polygon(id, below, [0,-1,0], color, offset, true);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const angle = turn + (i + .5) * 2 * Math.PI / segments;
      polygon(id, [above[i], above[j], below[j], below[i]], [Math.cos(angle),0,Math.sin(angle)], color, offset, segments <= 6);
    }
  }

  const woodOffset = [0,-.7,0];
  for (let board = 0; board < 6; board++) {
    const z = -1.19 + board * .475;
    cuboid('wood', [0,.036,z], [4,.248,.475], '#725340', woodOffset, grain[board]);
  }

  function housing(x, y, z, width, height, depth, separation) {
    const id = 'housings';
    const border = .055;
    for (const side of [-1,1]) {
      cuboid(id, [x + side * (width / 2 - border / 2),y,z], [border,height,depth], metal, separation, bright);
      cuboid(id, [x,y + side * (height / 2 - .035),z], [width,.07,depth], metal, separation, bright);
      for (const face of [-1,1]) {
        const surface = z + face * (depth / 2 - .026);
        cuboid(id, [x,y + side * height * .34,surface], [width,.085,.055], bright, separation);
        cuboid(id, [x + side * width * .44,y,surface], [.095,height,.056], metal, separation);
      }
    }
    for (const face of [-1,1]) {
      const surface = z + face * (depth / 2 - .027);
      for (const level of [-.13,.045,.17]) {
        cuboid(id, [x,y + level * height * 2,surface], [width * .83,.038,.053], bright, separation);
      }
      for (const rib of [-.29,-.11,.08,.27]) {
        cuboid(id, [x + rib * width,y,surface], [.036,height * .77,.053], metal, separation);
      }
    }
    cuboid(id, [x,y - .10,z], [width * .78,.058,depth * .72], shadow, separation);
    for (const stripe of [-.22,0,.22]) {
      cuboid(id, [x + stripe * width,y - .065,z], [.045,.025,depth * .72], bright, separation);
    }
  }

  housing(-.84,.53,-.05,1.52,.63,1.38,[-.36,1.15,-.13]);
  housing(.76,.58,.12,1.38,.74,1.48,[.45,1.43,.05]);

  for (const side of [-1,1]) {
    for (const end of [-1,1]) {
      const x = side * 1.59;
      const z = end * .88;
      const offset = [side * .73,.30,end * .36];
      cuboid('angles', [x,.195,z], [.46,.068,.38], metal, offset, bright);
      cuboid('angles', [x - side * .175,.386,z], [.069,.37,.38], metal, offset, bright);
      cuboid('angles', [x - side * .137,.23,z], [.075,.075,.38], bright, offset);
      for (const corner of [-1,1]) {
        const boltOffset = [side * .65,.94 + (end === 1 ? .22 : 0),end * .54 + corner * .13];
        const bx = x + side * .08;
        const bz = z + corner * .095;
        cylinder('bolts', [bx,.243,bz], .037,.09,8,metal,boltOffset);
        cylinder('bolts', [bx,.293,bz], .067,.052,6,steel,boltOffset);
        cylinder('bolts', [bx,.322,bz], .032,.009,6,shadow,boltOffset);
      }
    }
  }

  const scene = { mesh, components };
  if (typeof module === 'object' && module.exports) module.exports = scene;
  else root.ReFormEngineeringScene = scene;
})(typeof globalThis === 'object' ? globalThis : this);
